const { test, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const path = require("node:path");
const { readFileSync } = require("node:fs");

// Persistent in-memory SQL database supports actual transaction rollback and FK
// checks. Only MySQL lock/last-insert syntax is adapted by the fixture worker.
const worker = spawn("python3", [path.join(__dirname, "fixtures/taxonomy_sqlite.py")], { stdio: ["pipe", "pipe", "inherit"] });
const pending = [];
readline.createInterface({ input: worker.stdout }).on("line", (line) => {
  const response = JSON.parse(line);
  const { resolve, reject } = pending.shift();
  if (response.error) reject(Object.assign(new Error(response.error), { code: response.code }));
  else resolve(response.result);
});
worker.on("error", (error) => { while (pending.length) pending.shift().reject(error); });
worker.on("exit", () => { while (pending.length) pending.shift().reject(new Error("SQL fixture exited")); });
function call(action, sql, params) {
  return new Promise((resolve, reject) => {
    pending.push({ resolve, reject });
    worker.stdin.write(`${JSON.stringify({ action, sql, params })}\n`);
  });
}
after(() => worker.stdin.end());
let acquired = 0;
let released = 0;
let injectFailure = false;
const db = {
  beginTransaction: () => call("begin"), commit: () => call("commit"), rollback: () => call("rollback"),
  release: () => released++,
  query: async (sql, params = []) => {
    if (injectFailure && sql.startsWith("INSERT INTO observation_states")) throw new Error("Injected state insert failure");
    return [await call("query", sql, params)];
  },
};
require.cache[require.resolve("../dbTaxonomy")] = { exports: { query: (...args) => db.query(...args), getConnection: async () => { acquired++; return db; } } };
require.cache[require.resolve("../services/firebaseAdmin")] = { exports: {
  auth: () => ({ verifyIdToken: async (token) => ({ uid: "editor", admin: token === "admin" }) }),
} };
const router = require("../routes/taxonomyEditing");
const readRouter = require("../routes/taxonomy");
const keyRouter = require("../routes/keys");
beforeEach(async () => { await call("reset"); injectFailure = false; });
function request(method, url, body, token = "admin", target = router) {
  return new Promise((resolve) => {
    const req = { method, url, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { resolve({ status: this.statusCode, body: value }); },
      end() { resolve({ status: this.statusCode }); },
    };
    target.handle(req, res, (error) => resolve({ status: error ? 500 : 404, error }));
  });
}
const query = (sql, params = []) => call("query", sql, params);
const put = (characterId, body, descriptionId = 1) => request("PUT", `/descriptions/${descriptionId}/observations/${characterId}`, body);

test("every editing endpoint is admin-only before a connection is acquired", async () => {
  const routes = [
    ["POST", "/workspaces"], ["PATCH", "/workspaces/1"], ["POST", "/species"],
    ["POST", "/workspaces/1/species"], ["DELETE", "/workspaces/1/species/1"],
    ["POST", "/characters"], ["PATCH", "/characters/1"], ["POST", "/characters/1/states"],
    ["DELETE", "/characters/1/states/1"], ["POST", "/workspaces/1/characters"],
    ["DELETE", "/workspaces/1/characters/1"], ["PATCH", "/workspaces/1/characters"],
    ["POST", "/descriptions"], ["PATCH", "/descriptions/1"],
    ["PUT", "/descriptions/1/observations/1"], ["DELETE", "/descriptions/1/observations/1"],
    ["DELETE", "/workspaces/1"], ["DELETE", "/species/1"],
    ["DELETE", "/characters/1"], ["DELETE", "/descriptions/1"],
    ["POST", "/specimen-references"], ["GET", "/specimen-references/1"],
    ["PATCH", "/specimen-references/1"], ["DELETE", "/specimen-references/1"],
    ["POST", "/descriptions/1/specimens"], ["PATCH", "/descriptions/1/specimens/1"],
    ["DELETE", "/descriptions/1/specimens/1"], ["POST", "/descriptions/1/specimens/1/publications"],
    ["DELETE", "/descriptions/1/specimens/1/publications/1"],
    ["POST", "/specimen-references/1/observations"], ["PATCH", "/specimen-observations/1"],
    ["DELETE", "/specimen-observations/1"],
    ["PUT", "/descriptions/1/observations/1/specimen-evidence"],
    ["PUT", "/descriptions/1/observations/1/publication-evidence"],
    ["POST", "/descriptions/1/publications"], ["DELETE", "/descriptions/1/publications/1"],
  ];
  const before = acquired;
  for (const [method, url] of routes) {
    assert.equal((await request(method, url, {}, null)).status, 401);
    assert.equal((await request(method, url, {}, "member")).status, 403);
  }
  assert.equal(acquired, before);
});

test("create and patch workspace with defaults, validation and exact BIGINT serialization", async () => {
  const created = await request("POST", "/workspaces", { name: "Revision" });
  assert.equal(created.status, 201);
  assert.equal(created.body.owner_uid, "editor");
  assert.equal(created.body.visibility, "private");
  const changed = await request("PATCH", `/workspaces/${created.body.id}`, { description: "Notes", visibility: "shared" });
  assert.equal(changed.body.name, "Revision");
  assert.equal(changed.body.description, "Notes");
  assert.equal((await request("PATCH", "/workspaces/999", { name: "Missing" })).status, 404);
  await query("INSERT INTO workspaces (id, name) VALUES ('9007199254740993', 'Big')");
  assert.equal((await request("POST", "/workspaces", { name: "Next" })).body.id, "9007199254740994");
});

test("species creation and membership handle defaults, duplicates and cascaded description cleanup", async () => {
  const created = await request("POST", "/species", { genus: "Testphora", species_status: "work_in_progress", working_name: "Prairie 2" });
  assert.equal(created.status, 201);
  const speciesId = created.body.id;
  assert.equal((await request("POST", "/workspaces/1/species", { species_id: speciesId, display_order: 5 })).status, 201);
  assert.equal((await request("POST", "/workspaces/1/species", { species_id: speciesId })).status, 409);
  assert.equal((await request("POST", "/workspaces/999/species", { species_id: speciesId })).status, 404);
  assert.equal((await request("POST", "/species", { genus: "Testphora" })).status, 400);
  assert.equal((await request("POST", "/species", { genus: "Testphora", species_status: "work_in_progress" })).status, 400);
  await put(1, { state_ids: [1] });
  assert.equal((await request("DELETE", "/workspaces/1/species/1")).status, 204);
  assert.deepEqual(await query("SELECT * FROM character_observations"), []);
  assert.deepEqual(await query("SELECT * FROM observation_states"), []);
  assert.deepEqual((await query("SELECT id FROM species_descriptions")).map((r) => r.id), [2]);
  assert.equal((await query("SELECT * FROM species WHERE id = 1")).length, 1);
  assert.equal((await request("DELETE", "/workspaces/1/species/1")).status, 404);
});

test("key-referenced descriptions prevent membership removal without data loss", async () => {
  await query("INSERT INTO key_descriptions (key_id,description_id) VALUES (1,1)");
  await put(1, { state_ids: [1, 2] });
  assert.equal((await request("DELETE", "/workspaces/1/species/1")).status, 409);
  assert.equal((await query("SELECT * FROM species_descriptions WHERE id = 1")).length, 1);
  assert.equal((await query("SELECT * FROM observation_states")).length, 2);
});

test("characters and states validate type, ownership and usage", async () => {
  const created = await request("POST", "/characters", { name: "Eye size" });
  assert.equal(created.status, 201);
  assert.equal(created.body.created_by_uid, "editor");
  assert.equal((await request("PATCH", `/characters/${created.body.id}`, { name: "Eyes", data_type: "numeric_range", unit: "mm" })).status, 200);
  assert.equal((await request("POST", `/characters/${created.body.id}/states`, { name: "Small" })).status, 400);
  assert.equal((await request("PATCH", "/characters/1", { data_type: "numeric_range" })).status, 409);
  const state = await request("POST", "/characters/1/states", { name: "Two setae", display_order: 4 });
  assert.equal(state.status, 201);
  assert.equal((await request("POST", "/characters/1/states", { name: "Two setae" })).status, 409);
  assert.equal((await request("DELETE", `/characters/3/states/${state.body.id}`)).status, 404);
  assert.equal((await request("DELETE", `/characters/1/states/${state.body.id}`)).status, 204);
  await put(1, { state_ids: [1] });
  assert.equal((await request("DELETE", "/characters/1/states/1")).status, 409);
  await put(2, { numeric_min: 1 });
  assert.equal((await request("PATCH", "/characters/2", { unit: "cm" })).status, 409);
  assert.equal((await request("PATCH", "/characters/2", { data_type: "categorical", unit: null })).status, 409);
});

test("workspace character add, reorder and removal preserve shared characters", async () => {
  assert.equal((await request("POST", "/workspaces/1/characters", { character_id: 3 })).status, 201);
  assert.equal((await request("POST", "/workspaces/1/characters", { character_id: 3 })).status, 409);
  assert.equal((await request("PATCH", "/workspaces/1/characters", { character_ids: [3, 2, 1] })).status, 200);
  assert.deepEqual((await query("SELECT character_id FROM workspace_characters WHERE workspace_id = 1 ORDER BY display_order")).map((r) => r.character_id), [3, 2, 1]);
  for (const ids of [[1, 2], [1, 2, 2], [1, 2, 999]]) {
    assert.equal((await request("PATCH", "/workspaces/1/characters", { character_ids: ids })).status, 400);
  }
  await put(1, { state_ids: [1] });
  assert.equal((await request("DELETE", "/workspaces/1/characters/1")).status, 409);
  assert.equal((await request("DELETE", "/workspaces/1/characters/3")).status, 204);
  assert.equal((await query("SELECT * FROM characters WHERE id = 3")).length, 1);
  assert.equal((await request("DELETE", "/workspaces/1/characters/3")).status, 404);
});

test("descriptions require species membership and allow alternative workspace/species/sex interpretations", async () => {
  const created = await request("POST", "/descriptions", { workspace_id: 1, species_id: 1, sex_scope: "male", diagnosis: "Original" });
  assert.equal(created.status, 201);
  assert.equal(created.body.prepared_by_uid, "editor");
  const changed = await request("PATCH", `/descriptions/${created.body.id}`, { diagnosis: "Revised", remarks: null });
  assert.equal(changed.body.diagnosis, "Revised");
  assert.equal(changed.body.sex_scope, "male");
  assert.equal((await request("PATCH", `/descriptions/${created.body.id}`, { sex_scope: "female" })).status, 200);
  assert.equal((await request("PATCH", `/descriptions/${created.body.id}`, { workspace_id: 2 })).status, 200);
  assert.equal((await request("POST", "/descriptions", { workspace_id: 1, species_id: 999 })).status, 404);
  await query("INSERT INTO species (id, genus, specific_epithet) VALUES (2, 'Testphora', 'beta')");
  await query("INSERT INTO workspace_species (workspace_id,species_id,display_order) VALUES (2,2,0)");
  const notAssigned = await request("POST", "/descriptions", { workspace_id: 1, species_id: 2 });
  assert.equal(notAssigned.status, 404);
  assert.deepEqual(notAssigned.body, { error: "Species is not a member of this workspace" });
  assert.equal((await request("POST", "/descriptions", { workspace_id: 1, species_id: 1, sex_scope: "female" })).status, 201);
});

test("fixture foreign-key actions match the authoritative MySQL schema", async () => {
  const schema = readFileSync(path.join(__dirname, "../../db/schema/johnhash_phorid_taxonomy.sql"), "utf8");
  const tables = await query("SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'sqlite_sequence'");
  for (const { name } of tables) {
    const block = schema.match(new RegExp("ALTER TABLE `" + name + "`\\s+([\\s\\S]*?);", "g")) || [];
    const expected = [];
    for (const match of block.join("\n").matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES `([^`]+)` \(([^)]+)\)(?: ON DELETE (CASCADE|SET NULL))?/g)) {
      const columns = match[1].replace(/`/g, "").split(",").map((v) => v.trim());
      const referenced = match[3].replace(/`/g, "").split(",").map((v) => v.trim());
      columns.forEach((column, index) => expected.push(`${column}:${match[2]}:${referenced[index]}:${match[4] || "NO ACTION"}`));
    }
    const actual = (await query(`PRAGMA foreign_key_list(${name})`))
      .map((row) => `${row.from}:${row.table}:${row.to}:${row.on_delete}`);
    assert.deepEqual(actual.sort(), expected.sort(), name);
  }
});

test("creator identity is authenticated; explicit admin ownership and preparer attribution remain supported", async () => {
  const workspace = await request("POST", "/workspaces", { name: "Delegated", owner_uid: "research-owner" });
  assert.equal(workspace.body.owner_uid, "research-owner");
  assert.equal((await request("PATCH", `/workspaces/${workspace.body.id}`, { owner_uid: null })).body.owner_uid, null);
  const description = await request("POST", "/descriptions", { workspace_id: 1, species_id: 1, prepared_by_uid: "research-preparer" });
  assert.equal(description.body.prepared_by_uid, "research-preparer");
  assert.equal((await request("PATCH", `/descriptions/${description.body.id}`, { prepared_by_uid: null })).body.prepared_by_uid, null);
  assert.equal((await request("POST", "/characters", { name: "Spoof", created_by_uid: "another-user" })).status, 400);
  assert.equal((await request("PATCH", "/characters/1", { created_by_uid: "another-user" })).status, 400);
  assert.equal((await request("POST", "/characters", { name: "Authenticated" })).body.created_by_uid, "editor");
});

async function addEvidence() {
  await put(1, { state_ids: [1, 2] });
  await put(1, { state_ids: [2] }, 2);
  await query("INSERT INTO publications (id,citation) VALUES (1,'Fixture publication')");
  await query("INSERT INTO specimen_references (id,reference_type,publication_id) VALUES (1,'local',1)");
  await query("INSERT INTO description_publications (description_id,publication_id) VALUES (1,1)");
  await query("INSERT INTO description_specimens (description_id,specimen_reference_id) VALUES (1,1)");
}

test("DELETE workspace preserves schema cascades, reusable records and other workspaces", async () => {
  await addEvidence();
  assert.equal((await request("DELETE", "/workspaces/1")).status, 204);
  for (const table of ["workspace_species", "workspace_characters", "species_descriptions"]) {
    assert.equal((await query(`SELECT * FROM ${table} WHERE workspace_id = 1`)).length, 0);
  }
  assert.equal((await query("SELECT * FROM character_observations WHERE description_id = 1")).length, 0);
  assert.equal((await query("SELECT * FROM observation_states")).length, 1);
  for (const table of ["description_publications", "description_specimens"]) assert.deepEqual(await query(`SELECT * FROM ${table}`), []);
  for (const table of ["species", "characters", "character_states", "publications", "specimen_references", "identification_keys"]) {
    assert.ok((await query(`SELECT * FROM ${table}`)).length > 0, table);
  }
  assert.equal((await query("SELECT * FROM species_descriptions WHERE id = 2")).length, 1);
});

test("DELETE species cascades memberships/descriptions across workspaces while preserving global evidence", async () => {
  await addEvidence();
  assert.equal((await request("DELETE", "/species/1")).status, 204);
  for (const table of ["workspace_species", "species_descriptions", "character_observations", "observation_states", "description_publications", "description_specimens"]) {
    assert.deepEqual(await query(`SELECT * FROM ${table}`), [], table);
  }
  assert.equal((await query("SELECT * FROM workspaces")).length, 2);
  assert.equal((await query("SELECT * FROM workspace_characters")).length, 3);
  assert.equal((await query("SELECT * FROM publications")).length, 1);
  assert.equal((await query("SELECT * FROM specimen_references")).length, 1);
});

test("DELETE description cascades only its observations and evidence links", async () => {
  await addEvidence();
  assert.equal((await request("DELETE", "/descriptions/1")).status, 204);
  assert.deepEqual((await query("SELECT id FROM species_descriptions")).map((r) => r.id), [2]);
  assert.equal((await query("SELECT * FROM observation_states")).length, 1);
  for (const table of ["description_publications", "description_specimens"]) assert.deepEqual(await query(`SELECT * FROM ${table}`), []);
  assert.equal((await query("SELECT * FROM workspace_species")).length, 2);
  assert.equal((await query("SELECT * FROM publications")).length, 1);
  assert.equal((await query("SELECT * FROM specimen_references")).length, 1);
});

test("DELETE character cascades states and workspace memberships when no restrictive reference exists", async () => {
  assert.equal((await request("DELETE", "/characters/1")).status, 204);
  assert.deepEqual(await query("SELECT * FROM character_states WHERE character_id = 1"), []);
  assert.deepEqual(await query("SELECT * FROM workspace_characters WHERE character_id = 1"), []);
  assert.equal((await query("SELECT * FROM species_descriptions")).length, 2);
  assert.equal((await query("SELECT * FROM character_states WHERE character_id = 3")).length, 1);
});

test("all four DELETE routes return 404 for missing records and 400 for invalid IDs", async () => {
  for (const resource of ["workspaces", "species", "characters", "descriptions"]) {
    assert.equal((await request("DELETE", `/${resource}/999`)).status, 404);
    assert.equal((await request("DELETE", `/${resource}/0`)).status, 400);
  }
});

test("key references block workspace, species and description deletes with useful 409 errors and atomic rollback", async () => {
  await addEvidence();
  await query("INSERT INTO key_descriptions (key_id,description_id) VALUES (1,1)");
  for (const resource of ["workspaces", "species", "descriptions"]) {
    const response = await request("DELETE", `/${resource}/1`);
    assert.equal(response.status, 409);
    assert.match(response.body.error, /identification key/);
    assert.doesNotMatch(response.body.error, /FOREIGN KEY|DELETE FROM|constraint failed/);
    assert.equal((await query("SELECT * FROM workspace_characters")).length, 3);
    assert.equal((await query("SELECT * FROM species_descriptions")).length, 2);
    assert.equal((await query("SELECT * FROM observation_states")).length, 3);
    assert.equal((await query("SELECT * FROM description_publications")).length, 1);
  }
});

test("observations and key character references block character deletion without partial cascades", async () => {
  await put(1, { state_ids: [1] });
  let response = await request("DELETE", "/characters/1");
  assert.equal(response.status, 409);
  assert.match(response.body.error, /observations/);
  assert.equal((await query("SELECT * FROM character_states WHERE character_id = 1")).length, 2);
  assert.equal((await query("SELECT * FROM workspace_characters WHERE character_id = 1")).length, 2);
  await request("DELETE", "/descriptions/1/observations/1");
  await query("INSERT INTO key_characters (key_id,character_id) VALUES (1,1)");
  response = await request("DELETE", "/characters/1");
  assert.equal(response.status, 409);
  assert.match(response.body.error, /identification key/);
  assert.equal((await query("SELECT * FROM character_states WHERE character_id = 1")).length, 2);
});

test("a failure midway through character reorder rolls back every order change", async () => {
  const original = db.query;
  let updates = 0;
  db.query = async (sql, params) => {
    if (sql.startsWith("UPDATE workspace_characters") && ++updates === 2) throw new Error("Injected reorder failure");
    return original(sql, params);
  };
  try {
    assert.equal((await request("PATCH", "/workspaces/1/characters", { character_ids: [2, 1] })).status, 500);
  } finally { db.query = original; }
  assert.deepEqual(await query("SELECT character_id, display_order FROM workspace_characters WHERE workspace_id = 1 ORDER BY character_id"),
    [{ character_id: 1, display_order: 0 }, { character_id: 2, display_order: 1 }]);
});

test("categorical upsert replaces and deduplicates states, supports unknown and removes observations", async () => {
  const first = await put(1, { state_ids: [1, "1", 2], notes: "Variable" });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.state_ids, ["1", "2"]);
  const second = await put(1, { state_ids: [2] });
  assert.equal(second.body.id, first.body.id);
  assert.equal(second.body.notes, null);
  assert.deepEqual((await query("SELECT state_id FROM observation_states")).map((r) => r.state_id), [2]);
  assert.equal((await put(1, { state_ids: [3] })).status, 400);
  assert.deepEqual((await query("SELECT state_id FROM observation_states")).map((r) => r.state_id), [2]);
  assert.equal((await put(1, { state_ids: [] })).status, 200);
  assert.deepEqual(await query("SELECT * FROM observation_states"), []);
  assert.equal((await request("DELETE", "/descriptions/1/observations/1")).status, 204);
  assert.equal((await request("DELETE", "/descriptions/1/observations/1")).status, 404);
});

test("numeric ranges enforce precision, type, membership and inclusive bounds", async () => {
  const saved = await put(2, { numeric_min: 1.5, numeric_max: 1.8 });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.numeric_min, 1.5);
  assert.equal((await put(2, { numeric_min: 0 })).body.numeric_max, null);
  assert.equal((await put(2, { numeric_min: null, numeric_max: null })).status, 200);
  for (const body of [
    { numeric_min: 2, numeric_max: 1 }, { numeric_min: "1" }, { numeric_min: Infinity },
    { numeric_min: 1000000 }, { numeric_min: 0.0000001 }, { state_ids: [] }, { notes: "Only" },
  ]) assert.equal((await put(2, body)).status, 400);
  assert.equal((await put(1, { numeric_min: 1 })).status, 400);
  assert.equal((await put(1, { state_ids: [1], numeric_min: null })).status, 400);
  assert.equal((await put(3, { state_ids: [3] })).status, 400);
  assert.equal((await put(2, { numeric_min: 1 }, 2)).status, 400);
  assert.equal((await put(1, { state_ids: [1] }, 999)).status, 404);
});

test("failure during state replacement rolls back all changes and releases the connection", async () => {
  await put(1, { state_ids: [1], notes: "Before" });
  injectFailure = true;
  assert.equal((await put(1, { state_ids: [2], notes: "After" })).status, 500);
  injectFailure = false;
  assert.deepEqual((await query("SELECT state_id FROM observation_states")).map((r) => r.state_id), [1]);
  assert.equal((await query("SELECT notes FROM character_observations"))[0].notes, "Before");
  // finally executes just after the response resolves.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(acquired, released);
});

test("reject invalid bodies, enums, IDs, excessive text, unknown fields and SQL injection", async () => {
  for (const body of [null, [], {}, { name: " " }, { name: "x", visibility: "secret" }, { name: "x", extra: 1 }, { name: "x".repeat(256) }]) {
    assert.equal((await request("POST", "/workspaces", body)).status, 400);
  }
  for (const id of ["0", "-1", "1.2", "18446744073709551616", "1 OR 1=1"]) {
    assert.equal((await request("PATCH", `/workspaces/${id}`, { name: "No" })).status, 400);
  }
  assert.equal((await request("POST", "/workspaces/1/species", { species_id: 9007199254740992 })).status, 400);
  const created = await request("POST", "/workspaces", { name: "x'); DROP TABLE species; --" });
  assert.equal(created.status, 201);
  assert.equal((await query("SELECT * FROM species")).length, 1);
});

const detail = (id = 1) => request("GET", `/descriptions/${id}`, undefined, "admin", readRouter);
async function createSpecimen() {
  const result = await request("POST", "/specimen-references", { reference_type: "local", institution_code: "TEST", catalog_number: "001" });
  assert.equal(result.status, 201);
  return result.body.id;
}
async function assertObservation(specimenId, values = {}) {
  const response = await request("POST", `/specimen-references/${specimenId}/observations`, { character_id: 1, state_ids: [1], ...values });
  assert.equal(response.status, 201, response.error?.message || JSON.stringify(response.body));
  return response.body;
}
async function linkSpecimen(specimenId, descriptionId = 1, values = {}) {
  return request("POST", `/descriptions/${descriptionId}/specimens`, { specimen_reference_id: specimenId, ...values });
}
const specimenEvidence = (ids, characterId = 1, descriptionId = 1) => request("PUT", `/descriptions/${descriptionId}/observations/${characterId}/specimen-evidence`, { specimen_observation_ids: ids });
const publicationEvidence = (ids) => request("PUT", "/descriptions/1/observations/1/publication-evidence", { publication_ids: ids });

test("same workspace/species/sex interpretations coexist with distinct IDs and independent basis", async () => {
  const shared = { workspace_id: 1, species_id: 1, sex_scope: "female", basis: "publication" };
  const published = await request("POST", "/descriptions", { ...shared, interpretation_type: "published", interpretation_label: "Original revision", attribution_text: "Smith" });
  const alternative = await request("POST", "/descriptions", { ...shared, interpretation_type: "alternative", derived_from_description_id: published.body.id });
  assert.equal(published.status, 201);
  assert.equal(alternative.status, 201);
  assert.notEqual(published.body.id, alternative.body.id);
  const response = await detail(alternative.body.id);
  assert.equal(response.status, 200, response.error?.message);
  assert.equal(response.body.interpretation_type, "alternative");
  assert.equal(response.body.basis, "publication");
  assert.equal(response.body.derived_from_description_id, published.body.id);
  const workspace = await request("GET", "/workspaces/1/species", undefined, "admin", readRouter);
  assert.equal(workspace.body[0].descriptions.length, 3);
  assert.equal(workspace.body[0].descriptions.find((row) => row.id === published.body.id).attribution_text, "Smith");
  assert.equal((await request("PATCH", `/descriptions/${published.body.id}`, { interpretation_type: "new_interpretation", basis: "publication" })).status, 200);
  assert.equal((await request("PATCH", "/descriptions/1", { interpretation_type: "preferred" })).status, 400);
});

test("description derivation validates existing same-species sources on create and PATCH", async () => {
  await query("INSERT INTO species (id,genus,specific_epithet) VALUES (2,'Testphora','beta')");
  await query("INSERT INTO workspace_species (workspace_id,species_id) VALUES (1,2)");
  const other = await request("POST", "/descriptions", { workspace_id: 1, species_id: 2 });
  for (const source of ["999", other.body.id]) {
    assert.equal((await request("POST", "/descriptions", { workspace_id: 1, species_id: 1, derived_from_description_id: source })).status, 400);
    assert.equal((await request("PATCH", "/descriptions/1", { derived_from_description_id: source })).status, 400);
  }
  assert.equal((await request("PATCH", "/descriptions/1", { derived_from_description_id: "2", interpretation_label: "Compared" })).status, 200);
  assert.equal((await request("PATCH", "/descriptions/1", { species_id: 2 })).status, 400);
  assert.equal((await request("PATCH", "/descriptions/1", { species_id: 2, derived_from_description_id: null })).status, 200);
  const derived = await request("POST", "/descriptions", { workspace_id: 1, species_id: 1, derived_from_description_id: "2" });
  assert.equal((await request("DELETE", "/descriptions/2")).status, 204);
  assert.equal((await detail(derived.body.id)).body.derived_from_description_id, null);
});

test("description moves require destination membership and compatible synthesized characters", async () => {
  await put(2, { numeric_min: 1 });
  assert.equal((await request("PATCH", "/descriptions/1", { workspace_id: 2 })).status, 409);
  await request("POST", "/workspaces/2/characters", { character_id: 2 });
  assert.equal((await request("PATCH", "/descriptions/1", { workspace_id: 2 })).status, 200);
  await request("POST", "/workspaces", { name: "No species" });
  assert.equal((await request("PATCH", "/descriptions/1", { workspace_id: 3 })).status, 404);
});

test("specimen reference CRUD validates fields, preserves string IDs and respects restrictions", async () => {
  await query("INSERT INTO publications (id,citation) VALUES (1,'Source')");
  const created = await request("POST", "/specimen-references", { reference_type: "gbif", gbif_occurrence_key: "123456", publication_id: "1" });
  assert.equal(created.status, 201);
  assert.equal(created.body.gbif_occurrence_key, "123456");
  const id = created.body.id;
  assert.equal((await request("GET", `/specimen-references/${id}`)).body.publication_id, "1");
  assert.equal((await request("PATCH", `/specimen-references/${id}`, { specimen_label: "Voucher" })).body.specimen_label, "Voucher");
  assert.equal((await request("POST", "/specimen-references", { reference_type: "gbif", gbif_occurrence_key: "123456" })).status, 409);
  assert.equal((await request("POST", "/specimen-references", { reference_type: "invalid" })).status, 400);
  assert.equal((await request("PATCH", `/specimen-references/${id}`, { publication_id: 999 })).status, 404);
  assert.equal((await request("GET", "/specimen-references/999")).status, 404);
  assert.equal((await request("DELETE", "/specimen-references/999")).status, 404);
  await linkSpecimen(id);
  const blocked = await request("DELETE", `/specimen-references/${id}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /linked to a description/);
  assert.equal((await request("DELETE", `/descriptions/1/specimens/${id}`)).status, 204);
  assert.equal((await request("DELETE", `/specimen-references/${id}`)).status, 204);
});

test("reported material examined and reporting publication provenance require no scoring", async () => {
  const specimenId = await createSpecimen();
  await query("INSERT INTO publications (id,citation) VALUES (1,'Reported material')");
  const linked = await linkSpecimen(specimenId, 1, { reported_material_examined: true, notes: "Literature only" });
  assert.equal(linked.status, 201);
  assert.equal(linked.body.directly_examined, false);
  assert.equal((await request("POST", `/descriptions/1/specimens/${specimenId}/publications`, { publication_id: 1 })).status, 201);
  assert.equal((await request("POST", `/descriptions/1/specimens/${specimenId}/publications`, { publication_id: 1 })).status, 409);
  assert.equal((await request("POST", `/descriptions/1/specimens/${specimenId}/publications`, { publication_id: 999 })).status, 404);
  let response = await detail();
  assert.equal(response.status, 200, response.error?.message);
  const specimen = response.body.specimen_references[0];
  assert.equal(specimen.reported_material_examined, true);
  assert.equal(specimen.directly_examined, false);
  assert.equal(specimen.association_notes, "Literature only");
  assert.equal(specimen.material_examined_publications[0].id, "1");
  assert.deepEqual(await query("SELECT * FROM specimen_observations"), []);
  const patched = await request("PATCH", `/descriptions/1/specimens/${specimenId}`, { directly_examined: true });
  assert.equal(patched.body.reported_material_examined, true);
  assert.equal(patched.body.directly_examined, true);
  assert.equal((await request("PATCH", `/descriptions/1/specimens/${specimenId}`, { directly_examined: "true" })).status, 400);
  assert.equal((await request("DELETE", `/descriptions/1/specimens/${specimenId}/publications/1`)).status, 204);
  assert.equal((await request("DELETE", `/descriptions/1/specimens/${specimenId}/publications/1`)).status, 404);
  assert.equal((await request("DELETE", `/descriptions/1/specimens/${specimenId}`)).status, 204);
  assert.equal((await request("DELETE", `/descriptions/1/specimens/${specimenId}`)).status, 404);
});

test("competing specimen assertions coexist with independent attribution, basis and state sets", async () => {
  const specimenId = await createSpecimen();
  await query("INSERT INTO publications (id,citation) VALUES (1,'Taxonomist A')");
  const a = await assertObservation(specimenId, { observation_basis: "publication", source_publication_id: 1, attribution_text: "Taxonomist A" });
  const b = await assertObservation(specimenId, { state_ids: [2], observed_by_uid: "taxonomist-b", attribution_text: "Taxonomist B" });
  const c = await assertObservation(specimenId);
  assert.notEqual(a.id, b.id);
  assert.equal(a.observed_by_uid, null);
  assert.equal(a.source_publication.id, "1");
  assert.equal(b.observed_by_uid, "taxonomist-b");
  assert.equal(c.observed_by_uid, "editor");
  assert.equal((await query("SELECT * FROM specimen_observations")).length, 3);
  assert.deepEqual(a.states.map((s) => s.id), ["1"]);
  assert.deepEqual(b.states.map((s) => s.id), ["2"]);
  const patched = await request("PATCH", `/specimen-observations/${a.id}`, { state_ids: [1, 2, "2"], attribution_text: "A revised" });
  assert.equal(patched.status, 200, patched.error?.message || JSON.stringify(patched.body));
  assert.deepEqual(patched.body.states.map((s) => s.id), ["1", "2"]);
  assert.equal(patched.body.observation_basis, "publication");
  assert.equal(patched.body.observed_by_uid, null);
  assert.equal((await request("PATCH", `/specimen-observations/${a.id}`, { notes: "Metadata only" })).status, 200);
  assert.equal((await request("PATCH", `/specimen-observations/${a.id}`, { numeric_min: null })).status, 400);
  assert.equal((await request("PATCH", `/specimen-observations/${a.id}`, { state_ids: [3] })).status, 400);
  assert.equal((await request("PATCH", `/specimen-observations/${a.id}`, { observation_basis: "direct_exam" })).body.observed_by_uid, "editor");
  assert.equal((await request("PATCH", "/characters/1", { data_type: "numeric_range" })).status, 409);
  assert.equal((await request("DELETE", "/characters/1/states/2")).status, 409);
});

test("specimen numeric observations validate combined PATCH bounds, source existence and immutable character", async () => {
  const specimenId = await createSpecimen();
  const created = await request("POST", `/specimen-references/${specimenId}/observations`, { character_id: 2, numeric_min: 1.5, numeric_max: 1.8 });
  assert.equal(created.status, 201);
  assert.equal(created.body.numeric_range.unit, "mm");
  const url = `/specimen-observations/${created.body.id}`;
  assert.equal((await request("PATCH", url, { numeric_min: 2 })).status, 400);
  assert.equal((await request("PATCH", url, { numeric_max: 1 })).status, 400);
  assert.equal((await request("PATCH", url, { numeric_min: 1.7 })).body.numeric_max, 1.8);
  for (const values of [{ state_ids: [] }, { numeric_min: "1" }, { numeric_min: 0.0000001 }, { observation_basis: "unknown" }, { source_publication_id: 999 }, { character_id: 1 }]) {
    const status = Object.hasOwn(values, "source_publication_id") ? 404 : 400;
    assert.equal((await request("PATCH", url, values)).status, status);
  }
  assert.equal((await request("POST", `/specimen-references/${specimenId}/observations`, { character_id: 2, numeric_min: 2, numeric_max: 1 })).status, 400);
  assert.equal((await request("POST", `/specimen-references/${specimenId}/observations`, { character_id: 1, state_ids: [1], numeric_min: 1 })).status, 400);
  assert.equal((await request("POST", "/specimen-references/999/observations", { character_id: 1, state_ids: [1] })).status, 404);
  assert.equal((await request("PATCH", "/specimen-observations/999", { notes: "No" })).status, 404);
  assert.equal((await request("PATCH", "/characters/2", { unit: "cm" })).status, 409);
});

test("linked specimen evidence preserves competing descriptions and reconstructs the provenance chain", async () => {
  const specimenId = await createSpecimen();
  await linkSpecimen(specimenId);
  const alternative = await request("POST", "/descriptions", { workspace_id: 1, species_id: 1, sex_scope: "female", interpretation_type: "alternative" });
  await put(1, { state_ids: [1], evidence_basis: "specimen" });
  await put(1, { state_ids: [2], evidence_basis: "taxonomic_judgment" }, alternative.body.id);
  const a = await assertObservation(specimenId, { attribution_text: "Observer A" });
  const b = await assertObservation(specimenId, { state_ids: [2], attribution_text: "Observer B" });
  assert.equal((await specimenEvidence([a.id, b.id])).status, 200);
  assert.equal((await put(1, { state_ids: [1], evidence_basis: "invalid" })).status, 400);
  assert.equal((await put(1, { state_ids: [1] })).body.evidence_basis, "specimen");
  const response = await detail();
  assert.equal(response.status, 200, response.error?.message);
  const synthesis = response.body.character_observations[0];
  assert.equal(synthesis.evidence_basis, "specimen");
  assert.deepEqual(synthesis.states.map((s) => s.id), ["1"]);
  assert.deepEqual(synthesis.specimen_evidence.map((row) => row.id), [a.id, b.id]);
  assert.equal(synthesis.specimen_evidence[0].specimen_reference.id, specimenId);
  assert.equal(synthesis.specimen_evidence[0].character.id, "1");
  assert.deepEqual(synthesis.specimen_evidence[1].states.map((s) => s.id), ["2"]);
  const untouched = (await detail(alternative.body.id)).body.character_observations[0];
  assert.equal(untouched.evidence_basis, "taxonomic_judgment");
  assert.deepEqual(untouched.states.map((s) => s.id), ["2"]);
  assert.deepEqual(untouched.specimen_evidence, []);
  assert.equal((await specimenEvidence([b.id])).status, 200);
  assert.equal((await query("SELECT * FROM character_observation_specimen_evidence")).length, 1);
  assert.equal((await request("DELETE", `/specimen-observations/${b.id}`)).status, 204);
  assert.deepEqual(await query("SELECT * FROM character_observation_specimen_evidence"), []);
  assert.equal((await query("SELECT * FROM specimen_observations")).length, 1);
  assert.deepEqual((await detail()).body.character_observations[0].states.map((s) => s.id), ["1"]);
});

test("specimen evidence rejects wrong characters, unassociated specimens and missing resources without replacing links", async () => {
  const specimenId = await createSpecimen();
  const a = await assertObservation(specimenId);
  await put(1, { state_ids: [1] });
  assert.equal((await specimenEvidence([a.id])).status, 400);
  await linkSpecimen(specimenId);
  await specimenEvidence([a.id]);
  const numeric = await request("POST", `/specimen-references/${specimenId}/observations`, { character_id: 2, numeric_min: 1 });
  assert.equal((await specimenEvidence([numeric.body.id])).status, 400);
  assert.equal((await specimenEvidence(["999"])).status, 404);
  assert.equal((await specimenEvidence([a.id], 3)).status, 404);
  assert.equal((await specimenEvidence([a.id], 1, 999)).status, 404);
  assert.equal((await query("SELECT * FROM character_observation_specimen_evidence")).length, 1);
  assert.equal((await specimenEvidence([])).status, 200);
  assert.deepEqual(await query("SELECT * FROM character_observation_specimen_evidence"), []);
});

test("publication evidence requires explicit description membership and replaces links without changing synthesis", async () => {
  await query("INSERT INTO publications (id,citation) VALUES (1,'One'),(2,'Two')");
  await put(1, { state_ids: [1], evidence_basis: "publication" });
  assert.equal((await publicationEvidence([999])).status, 404);
  assert.equal((await publicationEvidence([1])).status, 400);
  assert.equal((await request("POST", "/descriptions/1/publications", { publication_id: 1 })).status, 201);
  assert.equal((await request("POST", "/descriptions/1/publications", { publication_id: 1 })).status, 409);
  await request("POST", "/descriptions/1/publications", { publication_id: 2 });
  assert.equal((await publicationEvidence([1, 2])).status, 200);
  let response = await detail();
  assert.deepEqual(response.body.character_observations[0].publication_evidence.map((p) => p.id), ["1", "2"]);
  assert.equal((await request("DELETE", "/descriptions/1/publications/1")).status, 409);
  assert.equal((await publicationEvidence([2])).status, 200);
  assert.equal((await request("DELETE", "/descriptions/1/publications/1")).status, 204);
  assert.equal((await request("DELETE", "/descriptions/1/publications/1")).status, 404);
  assert.equal((await publicationEvidence([])).status, 200);
  response = await detail();
  assert.deepEqual(response.body.character_observations[0].publication_evidence, []);
  assert.deepEqual(response.body.character_observations[0].states.map((s) => s.id), ["1"]);
});

test("evidence replacement and specimen state replacement roll back injected mid-write failures", async () => {
  const specimenId = await createSpecimen();
  await linkSpecimen(specimenId);
  await put(1, { state_ids: [1] });
  const a = await assertObservation(specimenId);
  const b = await assertObservation(specimenId, { state_ids: [2] });
  await specimenEvidence([a.id]);
  await query("INSERT INTO publications (id,citation) VALUES (1,'First'),(2,'Second')");
  await request("POST", "/descriptions/1/publications", { publication_id: 1 });
  await request("POST", "/descriptions/1/publications", { publication_id: 2 });
  await publicationEvidence([1]);
  const original = db.query;
  db.query = async (sql, params) => {
    if (sql.startsWith("INSERT INTO character_observation_specimen_evidence") || sql.startsWith("INSERT INTO specimen_observation_states") || sql.startsWith("INSERT INTO character_observation_publications")) throw new Error("Injected provenance write failure");
    return original(sql, params);
  };
  try {
    assert.equal((await specimenEvidence([b.id])).status, 500);
    assert.equal((await publicationEvidence([2])).status, 500);
    assert.equal((await request("PATCH", `/specimen-observations/${a.id}`, { state_ids: [2], notes: "Changed" })).status, 500);
  } finally { db.query = original; }
  assert.equal((await query("SELECT specimen_observation_id FROM character_observation_specimen_evidence"))[0].specimen_observation_id, Number(a.id));
  assert.equal((await query("SELECT state_id FROM specimen_observation_states WHERE specimen_observation_id = ?", [a.id]))[0].state_id, 1);
  assert.equal((await query("SELECT notes FROM specimen_observations WHERE id = ?", [a.id]))[0].notes, null);
  assert.deepEqual((await query("SELECT publication_id FROM character_observation_publications")).map((p) => p.publication_id), [1]);
});

test("numeric specimen evidence returns source publication and attribution without replacing explicit synthesis", async () => {
  const specimenId = await createSpecimen();
  await linkSpecimen(specimenId);
  await query("INSERT INTO publications (id,citation) VALUES (1,'Historical measurement')");
  const assertion = await request("POST", `/specimen-references/${specimenId}/observations`, {
    character_id: 2, numeric_min: 1.5, numeric_max: 1.8, observation_basis: "publication",
    attribution_text: "Historical taxonomist", source_publication_id: 1,
  });
  await put(2, { numeric_min: 1.6, numeric_max: 1.9, evidence_basis: "mixed" });
  assert.equal((await specimenEvidence([assertion.body.id], 2)).status, 200);
  const synthesis = (await detail()).body.character_observations[0];
  assert.deepEqual(synthesis.numeric_range, { min: 1.6, max: 1.9, unit: "mm" });
  assert.equal(synthesis.evidence_basis, "mixed");
  const evidence = synthesis.specimen_evidence[0];
  assert.deepEqual(evidence.numeric_range, { min: 1.5, max: 1.8, unit: "mm" });
  assert.equal(evidence.attribution_text, "Historical taxonomist");
  assert.equal(evidence.source_publication.id, "1");
  assert.equal(evidence.source_publication.citation, "Historical measurement");
  assert.equal(evidence.observed_by_uid, null);
  assert.deepEqual(evidence.states, []);
});

test("unlinking a specimen clears associated evidence and reporting links while preserving independent assertions", async () => {
  const specimenId = await createSpecimen();
  await linkSpecimen(specimenId);
  await query("INSERT INTO publications (id,citation) VALUES (1,'Material')");
  await request("POST", `/descriptions/1/specimens/${specimenId}/publications`, { publication_id: 1 });
  await put(1, { state_ids: [1] });
  const a = await assertObservation(specimenId);
  await specimenEvidence([a.id]);
  assert.equal((await request("DELETE", `/descriptions/1/specimens/${specimenId}`)).status, 204);
  assert.deepEqual(await query("SELECT * FROM description_specimen_publications"), []);
  assert.deepEqual(await query("SELECT * FROM character_observation_specimen_evidence"), []);
  assert.equal((await query("SELECT * FROM specimen_observations")).length, 1);
  assert.equal((await request("DELETE", `/specimen-references/${specimenId}`)).status, 204);
  assert.deepEqual(await query("SELECT * FROM specimen_observations"), []);
  assert.deepEqual(await query("SELECT * FROM specimen_observation_states"), []);
});

test("key filtering remains based on exact description synthesis despite contradictory raw specimen evidence", async () => {
  await query("INSERT INTO key_characters (key_id,character_id) VALUES (1,1)");
  await query("INSERT INTO key_descriptions (key_id,description_id) VALUES (1,1),(1,2)");
  await put(1, { state_ids: [1] });
  await put(1, { state_ids: [2] }, 2);
  const filters = { filters: [{ character_id: 1, state_ids: [1] }] };
  const before = await request("POST", "/1/filter", filters, "admin", keyRouter);
  assert.deepEqual(before.body.map((r) => r.id), ["1"]);
  const specimenId = await createSpecimen();
  await linkSpecimen(specimenId);
  const a = await assertObservation(specimenId, { state_ids: [2] });
  await specimenEvidence([a.id]);
  const after = await request("POST", "/1/filter", filters, "admin", keyRouter);
  assert.deepEqual(after.body, before.body);
  assert.equal((await detail()).body.character_observations[0].specimen_evidence[0].states[0].id, "2");
});
