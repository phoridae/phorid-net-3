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
require.cache[require.resolve("../dbGbif")] = { exports: { query: (...args) => db.query(...args) } };
require.cache[require.resolve("../services/firebaseAdmin")] = { exports: {
  auth: () => ({ verifyIdToken: async (token) => ({ uid: "editor", admin: token === "admin" }) }),
} };
const router = require("../routes/taxonomyEditing");
const readRouter = require("../routes/taxonomy");
const keyRouter = require("../routes/keys");
beforeEach(async () => { await call("reset"); injectFailure = false; });
function request(method, url, body, token = "admin", target = router) {
  return new Promise((resolve) => {
    const req = { method, url, body, query: Object.fromEntries(new URL(url, "http://local").searchParams), headers: token ? { authorization: `Bearer ${token}` } : {} };
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
    ["POST", "/workspaces/1/species/import"], ["POST", "/characters/with-states"],
    ["GET", "/workspaces/1/specimens"], ["GET", "/workspaces/1/specimens/1/identification"], ["PUT", "/workspaces/1/specimens/1/identification"], ["GET", "/specimen-references/1/external-taxonomy"],
    ["POST", "/species/import"], ["POST", "/specimen-references/import"],
    ["GET", "/specimen-references/search"], ["GET", "/specimen-references/duplicates"],
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

async function createWorkingSpecies() {
  const response = await request("POST", "/species", {
    genus: "Apocephalus", specific_epithet: null, species_status: "work_in_progress", working_name: "AZ-17", gbif_taxon_key: "1234567",
  });
  assert.equal(response.status, 201);
  return response.body;
}

for (const [name, identifiers, expected] of [
  ["legacy GBIF only", { gbif_taxon_key: "1234567" }, { gbif_taxon_key: "1234567", col_xr_taxon_key: null }],
  ["alphanumeric COL XR only", { col_xr_taxon_key: "Q2M4" }, { gbif_taxon_key: null, col_xr_taxon_key: "Q2M4" }],
  ["both independent external identifiers", { gbif_taxon_key: "1234567", col_xr_taxon_key: "Q2M4" }, { gbif_taxon_key: "1234567", col_xr_taxon_key: "Q2M4" }],
  ["neither identifier", {}, { gbif_taxon_key: null, col_xr_taxon_key: null }],
  ["explicitly null identifiers", { gbif_taxon_key: null, col_xr_taxon_key: null }, { gbif_taxon_key: null, col_xr_taxon_key: null }],
]) {
  test(`species creation supports ${name}`, async () => {
    const response = await request("POST", "/species", {
      genus: "Apocephalus", species_status: "work_in_progress", working_name: "AZ-17", ...identifiers,
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.gbif_taxon_key, expected.gbif_taxon_key);
    assert.equal(response.body.col_xr_taxon_key, expected.col_xr_taxon_key);
    assert.equal(response.body.specific_epithet, null);
  });
}

test("COL XR uses nullable VARCHAR(64) validation without numeric conversion or GBIF-key substitution", async () => {
  for (const value of [123, false, [], {}, "Q".repeat(65)]) {
    const response = await request("POST", "/species", { genus: "Testphora", specific_epithet: "invalid", col_xr_taxon_key: value });
    assert.equal(response.status, 400);
  }
  for (const key of ["000123", "Q".repeat(64)]) {
    const response = await request("POST", "/species", { genus: "Testphora", specific_epithet: "valid", col_xr_taxon_key: key });
    assert.equal(response.status, 201);
    assert.equal(response.body.col_xr_taxon_key, key);
    assert.equal(response.body.gbif_taxon_key, null);
  }
  assert.equal((await request("POST", "/species", { genus: "Testphora", specific_epithet: "invalid", gbif_taxon_key: "Q2M4" })).status, 400);
});

test("duplicate GBIF and COL XR identifiers independently return controlled 409 errors", async () => {
  const fields = { genus: "Testphora", specific_epithet: "duplicate" };
  assert.equal((await request("POST", "/species", { ...fields, gbif_taxon_key: "1234567", col_xr_taxon_key: "Q2M4" })).status, 201);
  for (const identifiers of [
    { gbif_taxon_key: "1234567", col_xr_taxon_key: "UNUSED" },
    { gbif_taxon_key: "7654321", col_xr_taxon_key: "Q2M4" },
  ]) {
    const response = await request("POST", "/species", { ...fields, ...identifiers });
    assert.equal(response.status, 409);
    assert.equal(typeof response.body.error, "string");
    assert.doesNotMatch(response.body.error, /UNIQUE|INSERT|constraint|uq_species/);
  }
  assert.equal((await query("SELECT * FROM species")).length, 2);
  assert.equal((await request("POST", "/species", { ...fields, gbif_taxon_key: "7654321", col_xr_taxon_key: "UNUSED" })).status, 201);
});

test("workspace, description, specimen, provenance and key species reads include both external identifiers", async () => {
  await query("UPDATE species SET gbif_taxon_key = '1234567', col_xr_taxon_key = 'Q2M4' WHERE id = 1");
  const check = (species) => {
    assert.equal(species.gbif_taxon_key, "1234567");
    assert.equal(species.col_xr_taxon_key, "Q2M4");
  };
  const workspaceSpecies = await request("GET", "/workspaces/1/species", undefined, "admin", readRouter);
  assert.equal(workspaceSpecies.status, 200);
  check(workspaceSpecies.body[0]);
  const specimenId = await createSpecimen();
  await query("UPDATE specimen_references SET species_id=1 WHERE id=?", [specimenId]); // legacy provenance fixture
  const specimen = await request("GET", `/specimen-references/${specimenId}`);
  check(specimen.body.species);
  await linkSpecimen(specimenId);
  const raw = await assertObservation(specimenId);
  check(raw.specimen_reference.species);
  await put(1, { state_ids: [1] });
  await specimenEvidence([raw.id]);
  const description = await detail();
  assert.equal(description.status, 200);
  check(description.body.species);
  check(description.body.specimen_references[0].species);
  check(description.body.character_observations[0].specimen_evidence[0].specimen_reference.species);
  await query("INSERT INTO key_characters (key_id,character_id) VALUES (1,1)");
  await query("INSERT INTO key_descriptions (key_id,description_id) VALUES (1,1)");
  const candidates = await request("GET", "/1/candidates", undefined, "admin", keyRouter);
  assert.equal(candidates.status, 200);
  check(candidates.body[0]);
  const filtered = await request("POST", "/1/filter", { filters: [{ character_id: 1, state_ids: [1] }] }, "admin", keyRouter);
  assert.equal(filtered.status, 200);
  check(filtered.body[0]);
});

const gbifTaxonomy = require("../services/gbifTaxonomy");
const externalSpeciesFixture = { genus: "Apocephalus", specific_epithet: "gemellus", species_status: "published", col_xr_taxon_key: "FQL6", gbif_taxon_key: "1545474" };

test("curated search finds global species by scientific/working names and identifiers", async () => {
  await createWorkingSpecies();
  for (const q of ["Apocephalus AZ-17", "1234567", "AZ-17"]) {
    const response = await request("GET", `/species/search?q=${encodeURIComponent(q)}`, undefined, "admin", readRouter);
    assert.equal(response.status, 200);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].working_name, "AZ-17");
  }
  assert.deepEqual((await request("GET", "/species/search?q=%25%25", undefined, "admin", readRouter)).body, []);
  assert.equal((await request("GET", "/species/search?q=a", undefined, "admin", readRouter)).status, 400);
});

test("normalized external lookup annotates existing local IDs and handles upstream failure", async (t) => {
  t.mock.method(gbifTaxonomy, "search", async () => [{ ...externalSpeciesFixture, rank: "SPECIES", importable: true }]);
  await request("POST", "/species", externalSpeciesFixture);
  const response = await request("GET", "/lookup/gbif/taxa?q=Apocephalus", undefined, "admin", readRouter);
  assert.equal(response.status, 200);
  assert.equal(response.body.results[0].col_xr_taxon_key, "FQL6");
  assert.ok(response.body.results[0].local_species_id);
  assert.equal((await request("GET", "/lookup/gbif/taxa?q=Apocephalus&rank=FAMILY", undefined, "admin", readRouter)).status, 400);
  gbifTaxonomy.search.mock.mockImplementation(async () => { throw Object.assign(new Error("Lookup unavailable"), { status: 502 }); });
  assert.equal((await request("GET", "/lookup/gbif/taxa?q=Apocephalus", undefined, "admin", readRouter)).status, 502);
});

test("external import is idempotent for global species and workspace membership", async (t) => {
  t.mock.method(gbifTaxonomy, "resolveSpecies", async () => externalSpeciesFixture);
  const first = await request("POST", "/workspaces/1/species/import", { col_xr_taxon_key: "FQL6" });
  const second = await request("POST", "/workspaces/1/species/import", { col_xr_taxon_key: "FQL6" });
  assert.equal(first.status, 200);
  assert.equal(first.body.created, true);
  assert.equal(second.body.species.id, first.body.species.id);
  assert.equal(second.body.created, false);
  assert.equal(second.body.already_in_workspace, true);
  const other = await request("POST", "/workspaces/2/species/import", { col_xr_taxon_key: "FQL6" });
  assert.equal(other.body.species.id, first.body.species.id);
  assert.equal((await query("SELECT * FROM species WHERE col_xr_taxon_key = 'FQL6'")).length, 1);
  assert.equal((await query("SELECT * FROM workspace_species WHERE species_id = ?", [first.body.species.id])).length, 2);
});

test("external imports reuse legacy-only records and fill verified COL IDs without replacing curated names", async (t) => {
  t.mock.method(gbifTaxonomy, "resolveSpecies", async () => externalSpeciesFixture);
  const existing = await request("POST", "/species", { genus: "Curatedgenus", specific_epithet: "curated", gbif_taxon_key: "1545474" });
  const response = await request("POST", "/workspaces/1/species/import", { col_xr_taxon_key: "FQL6" });
  assert.equal(response.status, 200);
  assert.equal(response.body.species.id, existing.body.id);
  assert.equal(response.body.species.genus, "Curatedgenus");
  assert.equal(response.body.species.col_xr_taxon_key, "FQL6");
});

test("conflicting external identities and failed imports never create memberships", async (t) => {
  t.mock.method(gbifTaxonomy, "resolveSpecies", async () => externalSpeciesFixture);
  await request("POST", "/species", { genus: "First", specific_epithet: "one", gbif_taxon_key: "1545474" });
  await request("POST", "/species", { genus: "Second", specific_epithet: "two", col_xr_taxon_key: "FQL6" });
  assert.equal((await request("POST", "/workspaces/1/species/import", { col_xr_taxon_key: "FQL6" })).status, 409);
  assert.equal((await query("SELECT * FROM workspace_species WHERE workspace_id = 1")).length, 1);
  gbifTaxonomy.resolveSpecies.mock.mockImplementation(async () => { throw Object.assign(new Error("External unavailable"), { status: 502 }); });
  assert.equal((await request("POST", "/workspaces/1/species/import", { col_xr_taxon_key: "FQL6" })).status, 502);
  assert.equal((await query("SELECT * FROM species")).length, 3);
});

test("manual WIP creation supports meaningful code names, epithets and no external IDs", async () => {
  const working = await request("POST", "/species", { genus: "Apocephalus", working_name: "AZ-17", species_status: "work_in_progress" });
  assert.equal(working.status, 201);
  assert.equal(working.body.gbif_taxon_key, null);
  assert.equal(working.body.col_xr_taxon_key, null);
  assert.equal((await request("POST", "/workspaces/1/species", { species_id: working.body.id })).status, 201);
  assert.equal((await request("POST", "/species", { genus: "Apocephalus", specific_epithet: "provisional", species_status: "work_in_progress" })).status, 201);
  assert.equal((await request("POST", "/species", { genus: "Apocephalus", working_name: "  ", species_status: "work_in_progress" })).status, 400);
});

test("species search and external lookup require admin claims without client-side ownership filtering", async () => {
  for (const url of ["/species/search?q=Apocephalus", "/lookup/gbif/taxa?q=Apocephalus"]) {
    assert.equal((await request("GET", url, undefined, null, readRouter)).status, 401);
    assert.equal((await request("GET", url, undefined, "member", readRouter)).status, 403);
  }
});

test("global character search includes ordered states and matches name, region and definition", async () => {
  await query("UPDATE characters SET anatomical_region = 'Thorax', description = 'Anepisternal setation' WHERE id = 1");
  await query("UPDATE character_states SET display_order = 2 WHERE id = 1");
  for (const q of ["Setae", "Thorax", "Anepisternal", "Thorax setation"]) {
    const response = await request("GET", `/characters/search?q=${encodeURIComponent(q)}`, undefined, "admin", readRouter);
    assert.equal(response.status, 200, response.error?.message);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].id, "1");
    assert.equal(response.body[0].data_type, "categorical");
    assert.equal(response.body[0].visibility, "private");
    assert.deepEqual(response.body[0].states.map((state) => state.id), ["2", "1"]);
  }
  assert.deepEqual((await request("GET", "/characters/search?q=%25%25", undefined, "admin", readRouter)).body, []);
  assert.equal((await request("GET", "/characters/search?q=a", undefined, "admin", readRouter)).status, 400);
  assert.equal((await request("GET", "/characters/999", undefined, "admin", readRouter)).status, 404);
});

test("character creation with states and workspace membership is atomic and ordered", async () => {
  const response = await request("POST", "/characters/with-states", {
    workspace_id: "1", name: "Anepisternal setae", anatomical_region: "Thorax", visibility: "shared",
    states: [{ name: "bare", description: "No setae" }, { name: "small setulae" }],
  });
  assert.equal(response.status, 201, response.error?.message);
  assert.equal(response.body.created_by_uid, "editor");
  assert.equal(response.body.data_type, "categorical");
  assert.deepEqual(response.body.states.map((state) => [state.name, state.display_order]), [["bare", 0], ["small setulae", 1]]);
  const membership = await query("SELECT * FROM workspace_characters WHERE character_id = ?", [response.body.id]);
  assert.equal(membership.length, 1);
  assert.equal(membership[0].workspace_id, 1);
  const read = await request("GET", `/characters/${response.body.id}`, undefined, "admin", readRouter);
  assert.deepEqual(read.body, response.body);
});

test("numeric character creation has a unit and no categorical states", async () => {
  const response = await request("POST", "/characters/with-states", { workspace_id: "1", name: "Wing length", data_type: "numeric_range", unit: "mm" });
  assert.equal(response.status, 201);
  assert.equal(response.body.unit, "mm");
  assert.deepEqual(response.body.states, []);
  for (const fields of [
    { data_type: "numeric_range", states: [{ name: "invalid" }] },
    { data_type: "categorical", unit: "mm" }, { states: [{ name: "" }] },
    { states: [{ name: "a", id: "1" }] }, { states: "invalid" }, { created_by_uid: "forged" },
  ]) assert.equal((await request("POST", "/characters/with-states", { name: "Invalid", ...fields })).status, 400);
});

test("duplicate states and failed membership roll back new character and states", async (t) => {
  const beforeCharacters = await query("SELECT * FROM characters");
  const beforeStates = await query("SELECT * FROM character_states");
  const duplicate = await request("POST", "/characters/with-states", { workspace_id: "1", name: "Duplicate states", states: [{ name: "bare" }, { name: "bare" }] });
  assert.equal(duplicate.status, 409);
  assert.doesNotMatch(duplicate.body.error, /UNIQUE|constraint|INSERT/);
  assert.deepEqual(await query("SELECT * FROM characters"), beforeCharacters);
  assert.deepEqual(await query("SELECT * FROM character_states"), beforeStates);
  const original = db.query;
  t.mock.method(db, "query", async (sql, params) => {
    if (sql.startsWith("INSERT INTO workspace_characters")) throw Object.assign(new Error("Membership conflict"), { code: "ER_DUP_ENTRY" });
    return original(sql, params);
  });
  assert.equal((await request("POST", "/characters/with-states", { workspace_id: "1", name: "Failed membership", states: [{ name: "first" }] })).status, 409);
  assert.deepEqual(await query("SELECT * FROM characters"), beforeCharacters);
  assert.deepEqual(await query("SELECT * FROM character_states"), beforeStates);
});

test("character usage counts both observation layers, state usage and distinct keys", async () => {
  const specimenId = await createSpecimen();
  await assertObservation(specimenId);
  await put(1, { state_ids: [1, 2] });
  await query("INSERT INTO key_characters (key_id, character_id) VALUES (1,1)");
  await query("INSERT INTO key_descriptions (key_id, description_id) VALUES (1,1)");
  const response = await request("GET", "/characters/1/usage", undefined, "admin", readRouter);
  assert.equal(response.status, 200, response.error?.message);
  assert.deepEqual(response.body, {
    workspace_count: 2, specimen_observation_count: 1, description_observation_count: 1, key_count: 1,
    states: [{ id: "1", specimen_observation_count: 1, description_observation_count: 1 }, { id: "2", specimen_observation_count: 0, description_observation_count: 1 }],
  });
  // A key selecting a description also depends on its observed character.
  await query("DELETE FROM key_characters WHERE key_id = 1");
  assert.equal((await request("GET", "/characters/1/usage", undefined, "admin", readRouter)).body.key_count, 1);
  assert.equal((await request("GET", "/characters/999/usage", undefined, "admin", readRouter)).status, 404);
  assert.equal((await request("DELETE", "/characters/1/states/1")).status, 409);
  await put(1, { state_ids: [2] });
  const specimenConflict = await request("DELETE", "/characters/1/states/1");
  assert.equal(specimenConflict.status, 409);
  assert.match(specimenConflict.body.error, /specimen observations/);
});

test("new interpretation creates distinct global character/state IDs without changing the source", async () => {
  const source = (await request("GET", "/characters/1", undefined, "admin", readRouter)).body;
  const { name, description, anatomical_region, data_type, unit, visibility } = source;
  const copy = await request("POST", "/characters/with-states", { workspace_id: "1", name, description, anatomical_region, data_type, unit, visibility,
    states: source.states.map(({ name, description }) => ({ name, description })),
  });
  assert.equal(copy.status, 201);
  assert.notEqual(copy.body.id, source.id);
  assert.deepEqual(copy.body.states.map((state) => state.name), source.states.map((state) => state.name));
  assert.ok(copy.body.states.every((state) => !source.states.some((old) => old.id === state.id)));
  assert.deepEqual((await request("GET", "/characters/1", undefined, "admin", readRouter)).body, source);
  assert.equal((await request("POST", "/workspaces/2/characters", { character_id: copy.body.id })).status, 201);
  assert.equal((await request("POST", "/workspaces/2/characters", { character_id: copy.body.id })).status, 409);
  assert.equal((await request("DELETE", `/workspaces/1/characters/${copy.body.id}`)).status, 204);
  assert.equal((await query("SELECT * FROM characters WHERE id = ?", [copy.body.id])).length, 1);
  assert.equal((await query("SELECT * FROM character_states WHERE character_id = ?", [copy.body.id])).length, 2);
  assert.equal((await query("SELECT * FROM workspace_characters WHERE character_id = ?", [copy.body.id])).length, 1);
});

test("global character search, detail and usage are admin-only", async () => {
  for (const url of ["/characters/search?q=setae", "/characters/1", "/characters/1/usage"]) {
    assert.equal((await request("GET", url, undefined, null, readRouter)).status, 401);
    assert.equal((await request("GET", url, undefined, "member", readRouter)).status, 403);
  }
});

const gbifSpecimens = require("../services/gbifSpecimens");
const cacheOccurrence = { gbifid: "4021395742", snapshot_date: "2026-01-01", species_key: "9608828", family: "Phoridae", genus: "Myriophora", specific_epithet: "wellsorum", species: "Myriophora wellsorum", scientific_name: "Myriophora wellsorum Brown", taxon_rank: "SPECIES", institution_code: "LACM", collection_code: "ENT", catalog_number: "12345", recorded_by: "Collector Person", locality: "California", country: "United States", basis_of_record: "PRESERVED_SPECIMEN", event_date: "2024-05-12" };
const liveOccurrence = { key: 4021395742, speciesKey: 9608828, family: "Phoridae", genus: "Myriophora", specificEpithet: "wellsorum", species: "Myriophora wellsorum", scientificName: "Myriophora wellsorum Brown", taxonRank: "SPECIES", institutionCode: "LACM", collectionCode: "ENT", catalogNumber: "12345", recordedBy: "Collector Person", locality: "California", country: "United States", basisOfRecord: "PRESERVED_SPECIMEN", eventDate: "2024-05-12" };
async function seedOccurrence(values = {}) {
  const row = { ...cacheOccurrence, ...values };
  await query(`INSERT INTO gbif_occurrence_phoridae (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`, Object.values(row));
}
function mockLive(t, rows = [liveOccurrence]) {
  return t.mock.method(global, "fetch", async (url) => ({ ok: true, status: 200, json: async () =>
    url.pathname === "/v1/species/search" ? { results: [{ rank: "FAMILY", canonicalName: "Phoridae", taxonomicStatus: "ACCEPTED", key: 9502 }] }
      : url.pathname === "/v1/occurrence/search" ? { results: rows } : rows[0],
  }));
}
const specimenLookup = (q, source = "cache", token = "admin") => request("GET", `/lookup/gbif/specimens?${new URLSearchParams({ q, source })}`, undefined, token, readRouter);

test("global specimen search is independent of workspace and legacy species is explicitly readable", async () => {
  const specimenId = await createSpecimen();
  await query("UPDATE specimen_references SET species_id=1 WHERE id=?", [specimenId]); // legacy fixture only
  const global = await request("GET", "/specimen-references/search?q=Testphora");
  assert.equal(global.body[0].id, specimenId);
  assert.equal(global.body[0].legacy_species.id, "1");
  assert.equal(global.body[0].workspace_identification, null);
  for (const workspaceId of ["1", "2"]) {
    const scoped = await request("GET", `/specimen-references/search?q=&workspace_id=${workspaceId}`);
    assert.deepEqual(scoped.body.map((row) => row.id), [specimenId]);
    assert.equal(scoped.body[0].workspace_identification, null);
  }
});

test("cache fuzzy specimen lookup matches combinations of real schema fields", async () => {
  await seedOccurrence();
  for (const q of ["Myriophora wellsorum", "LACM wellsorum", "LACM", "ENT", "12345", "LACM 12345", "Collector California"]) {
    const result = await specimenLookup(q);
    assert.equal(result.status, 200, result.error?.message);
    assert.equal(result.body.query_type, "fuzzy");
    assert.equal(result.body.results.length, 1, q);
    assert.equal(result.body.results[0].gbif_occurrence_key, "4021395742");
    assert.equal(result.body.results[0].collection_code, "ENT");
    assert.equal(result.body.results[0].source, "cache");
    assert.equal(result.body.results[0].col_xr_taxon_key, null);
  }
  assert.equal((await specimenLookup("%%")).body.results.length, 0);
});

test("cache ranking puts exact institutional matches before broad substrings and prefers vouchers", async () => {
  await seedOccurrence({ gbifid: "3", institution_code: "PREFIX-LACM", basis_of_record: "HUMAN_OBSERVATION" });
  await seedOccurrence({ gbifid: "2" });
  await seedOccurrence({ gbifid: "1", basis_of_record: "HUMAN_OBSERVATION" });
  await seedOccurrence({ gbifid: "4", catalog_number: null, basis_of_record: "HUMAN_OBSERVATION" });
  const result = await specimenLookup("LACM");
  assert.deepEqual(result.body.results.map((row) => row.gbif_occurrence_key), ["2", "1", "3"]);
});

test("numeric occurrence queries use exact cache IDs and exact live occurrence endpoint", async (t) => {
  await seedOccurrence();
  await seedOccurrence({ gbifid: "4021395743", catalog_number: "4021395742" });
  const cached = await specimenLookup("4021395742");
  assert.equal(cached.body.query_type, "occurrence_key");
  assert.equal(cached.body.results.length, 1);
  const fetch = mockLive(t);
  const live = await specimenLookup("4021395742", "live_gbif");
  assert.equal(live.status, 200);
  assert.equal(live.body.query_type, "occurrence_key");
  assert.equal(fetch.mock.calls.length, 1);
  assert.equal(fetch.mock.calls[0].arguments[0].pathname, "/v1/occurrence/4021395742");
  assert.equal(fetch.mock.calls[0].arguments[0].searchParams.get("checklistKey"), gbifTaxonomy.BACKBONE);
});

test("cache and live normalize consistently, preserving two independent species identifiers", async (t) => {
  await seedOccurrence();
  mockLive(t);
  const cache = (await specimenLookup("LACM")).body.results[0];
  const live = (await specimenLookup("LACM", "live_gbif")).body.results[0];
  assert.deepEqual({ ...cache, source: "live_gbif" }, live);
  const withCol = { ...liveOccurrence, classifications: {
    [gbifTaxonomy.COL_XR]: { acceptedUsage: { key: "8CYC6", rank: "SPECIES", genericName: "Myriophora", specificEpithet: "wellsorum" } },
    [gbifTaxonomy.BACKBONE]: { acceptedUsage: { key: "9608828", rank: "SPECIES" } },
  } };
  const normalized = gbifSpecimens.normalize(withCol, "live_gbif");
  assert.equal(normalized.col_xr_taxon_key, "8CYC6");
  assert.equal(normalized.gbif_taxon_key, "9608828");
  const huge = gbifSpecimens.normalize({ ...cacheOccurrence, gbifid: "9007199254740993" }, "cache");
  assert.equal(huge.gbif_occurrence_key, "9007199254740993");
  assert.equal(gbifSpecimens.normalize({ ...liveOccurrence, key: Number.MAX_SAFE_INTEGER + 1 }, "live_gbif"), null);
});

test("lookup annotates existing specimens and resolves suggested species by COL, GBIF then unique exact name", async (t) => {
  await seedOccurrence();
  await query("UPDATE species SET genus='Myriophora', specific_epithet='wellsorum', gbif_taxon_key='9608828' WHERE id=1");
  const existing = await request("POST", "/specimen-references", { reference_type: "gbif", gbif_occurrence_key: "4021395742" });
  const cache = (await specimenLookup("LACM")).body.results[0];
  assert.equal(cache.existing_specimen_id, existing.body.id);
  assert.equal(cache.species_suggestion.id, "1");
  assert.equal(cache.species_match, "gbif_taxon_key");
  const col = await request("POST", "/species", { genus: "Curatedname", specific_epithet: "alternative", col_xr_taxon_key: "8CYC6" });
  mockLive(t, [{ ...liveOccurrence, classifications: { [gbifTaxonomy.COL_XR]: { usage: { key: "8CYC6", rank: "SPECIES" } } } }]);
  const live = (await specimenLookup("4021395742", "live_gbif")).body.results[0];
  assert.equal(live.existing_specimen_id, existing.body.id);
  assert.equal(live.species_suggestion.id, col.body.id);
  assert.equal(live.species_match, "col_xr_taxon_key");
  await query("UPDATE species SET gbif_taxon_key=NULL WHERE id=1");
  assert.equal((await specimenLookup("LACM")).body.results[0].species_match, "scientific_name");
  await request("POST", "/species", { genus: "Myriophora", specific_epithet: "wellsorum" });
  assert.equal((await specimenLookup("LACM")).body.results[0].species_suggestion, null);
});

test("global occurrence import is idempotent and writes no legacy or workspace assignment", async () => {
  await seedOccurrence();
  const values = { gbif_occurrence_key: "4021395742", specimen_label: "Voucher" };
  const first = await request("POST", "/specimen-references/import", values);
  assert.equal(first.status, 200);
  assert.equal(first.body.created, true);
  assert.equal(first.body.specimen.species_id, null);
  assert.equal(first.body.specimen.collection_code, "ENT");
  await query("DELETE FROM gbif_occurrence_phoridae");
  const retry = await request("POST", "/specimen-references/import", values);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.created, false);
  assert.equal(retry.body.specimen.id, first.body.specimen.id);
  assert.equal((await query("SELECT * FROM specimen_references")).length, 1);
  assert.deepEqual(await query("SELECT * FROM workspace_specimen_identifications"), []);
});

test("live fallback imports a global voucher without identification", async (t) => {
  const fetch = mockLive(t);
  const result = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742" });
  assert.equal(result.status, 200);
  assert.equal(result.body.specimen.species_id, null);
  assert.equal(result.body.specimen.collection_code, "ENT");
  assert.equal(fetch.mock.calls[0].arguments[0].pathname, "/v1/occurrence/4021395742");
});

test("manual duplicate discovery warns without imposing identity or uniqueness", async () => {
  const values = { reference_type: "local", institution_code: "USNM", catalog_number: "12345" };
  const first = await request("POST", "/specimen-references", values);
  const duplicates = await request("GET", "/specimen-references/duplicates?institution_code=usnm&catalog_number=12345");
  assert.equal(duplicates.status, 200);
  assert.equal(duplicates.body.length, 1);
  assert.equal(duplicates.body[0].id, first.body.id);
  assert.equal(duplicates.body[0].legacy_species, null);
  assert.equal((await request("POST", "/specimen-references", values)).status, 201);
  assert.equal((await request("GET", "/specimen-references/duplicates")).status, 400);
});

test("global species import reuses existing resolution/duplicate logic without workspace membership", async (t) => {
  t.mock.method(gbifTaxonomy, "resolveSpecies", async () => externalSpeciesFixture);
  const first = await request("POST", "/species/import", { col_xr_taxon_key: "FQL6" });
  const retry = await request("POST", "/species/import", { col_xr_taxon_key: "FQL6" });
  assert.equal(first.status, 200);
  assert.equal(first.body.created, true);
  assert.equal(retry.body.created, false);
  assert.equal(first.body.species.id, retry.body.species.id);
  assert.equal((await query("SELECT * FROM workspace_species WHERE species_id = ?", [first.body.species.id])).length, 0);
});

test("lookup failures are controlled and do not prevent cache search or manual creation", async (t) => {
  await seedOccurrence();
  t.mock.method(global, "fetch", async () => { throw new Error("Private upstream detail"); });
  const failed = await specimenLookup("LACM", "live_gbif");
  assert.equal(failed.status, 502);
  assert.doesNotMatch(failed.body.error, /Private upstream detail/);
  assert.equal((await specimenLookup("LACM")).body.results.length, 1);
  assert.equal((await request("POST", "/specimen-references", { reference_type: "local" })).status, 201);
  const original = db.query;
  t.mock.method(db, "query", async (sql, params) => {
    if (sql.includes("FROM gbif_occurrence_phoridae")) throw new Error("Private database error");
    return original(sql, params);
  });
  assert.equal((await specimenLookup("LACM")).status, 503);
});

test("specimen lookup and import validate bodies, missing species and admin authorization", async () => {
  assert.equal((await request("POST", "/specimen-references/import", { workspace_id: "1", gbif_occurrence_key: "4021395742" })).status, 400);
  assert.equal((await request("POST", "/specimen-references/import", { workspace_id: "1", gbif_occurrence_key: "4021395742", species_id: "999" })).status, 404);
  assert.equal((await request("POST", "/specimen-references/import", { gbif_occurrence_key: "invalid", species_id: "1" })).status, 400);
  assert.equal((await specimenLookup("")).status, 400);
  assert.equal((await specimenLookup("LACM", "unknown")).status, 400);
  assert.equal((await specimenLookup("LACM", "cache", null)).status, 401);
  assert.equal((await specimenLookup("LACM", "cache", "member")).status, 403);
});

test("missing live occurrences yield an empty lookup and a controlled import 404", async (t) => {
  t.mock.method(global, "fetch", async () => ({ ok: false, status: 404 }));
  const response = await specimenLookup("4021395742", "live_gbif");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.results, []);
  const imported = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742" });
  assert.equal(imported.status, 404);
  assert.equal((await query("SELECT * FROM specimen_references")).length, 0);
});

test("live fuzzy lookup selects the accepted exact family and filters broad upstream matches", async (t) => {
  const fetch = t.mock.method(global, "fetch", async (url) => ({ ok: true, status: 200, json: async () => url.pathname === "/v1/species/search" ? {
    results: [{ key: 12, rank: "FAMILY", canonicalName: "Phoridae", taxonomicStatus: "SYNONYM" }, { key: 9502, rank: "FAMILY", canonicalName: "Phoridae", taxonomicStatus: "ACCEPTED" }],
  } : { results: [liveOccurrence, { ...liveOccurrence, key: 123, specificEpithet: "other", species: "Myriophora other" }] } }));
  const response = await specimenLookup("LACM wellsorum", "live_gbif");
  assert.equal(response.status, 200);
  assert.equal(response.body.results.length, 1);
  assert.equal(fetch.mock.calls[1].arguments[0].searchParams.get("familyKey"), "9502");
  assert.equal(fetch.mock.calls[0].arguments[0].searchParams.get("datasetKey"), gbifTaxonomy.BACKBONE);
});

test("specimen collection code supports manual create, patch, null and omitted-field compatibility", async () => {
  const fields = { reference_type: "local", institution_code: "LACM", collection_code: "ENT", catalog_number: "12345", specimen_label: "Descriptive voucher label" };
  const created = await request("POST", "/specimen-references", fields);
  assert.equal(created.status, 201);
  assert.equal(created.body.collection_code, "ENT");
  assert.equal(created.body.specimen_label, "Descriptive voucher label");
  const url = `/specimen-references/${created.body.id}`;
  assert.equal((await request("GET", url)).body.collection_code, "ENT");
  assert.equal((await request("PATCH", url, { collection_code: "DIP" })).body.collection_code, "DIP");
  assert.equal((await request("PATCH", url, { notes: "Other metadata only" })).body.collection_code, "DIP");
  assert.equal((await request("PATCH", url, { collection_code: null })).body.collection_code, null);
  for (const value of [42, false, {}, "E".repeat(65)]) {
    assert.equal((await request("POST", "/specimen-references", { ...fields, collection_code: value })).status, 400);
    assert.equal((await request("PATCH", url, { collection_code: value })).status, 400);
  }
  for (const extra of [{}, { collection_code: null }, { collection_code: "ENT", institution_code: null, catalog_number: null }]) {
    const result = await request("POST", "/specimen-references", { reference_type: "local", ...extra });
    assert.equal(result.status, 201);
    assert.equal(result.body.collection_code, extra.collection_code || null);
  }
});

test("curated collection search matches single and combined institution/collection/catalog terms", async () => {
  const created = await request("POST", "/specimen-references", { reference_type: "local", institution_code: "LACM", collection_code: "ENT", catalog_number: "12345" });
  for (const q of ["ENT", "LACM ENT", "LACM ENT 12345"]) {
    const response = await request("GET", `/specimen-references/search?q=${encodeURIComponent(q)}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].id, created.body.id);
    assert.equal(response.body[0].collection_code, "ENT");
  }
});

test("duplicate discovery requires every supplied normalized identity component and keeps collection-less fallback", async () => {
  const create = async (institution_code, collection_code) => (await request("POST", "/specimen-references", {
    reference_type: "local", institution_code, collection_code, catalog_number: " 12345 ",
  })).body;
  const ent = await create(" LACM ", " ENT ");
  const other = await create("LACM", "DIP");
  const legacy = await create("LACM", null);
  await create("USNM", "ENT");
  const exact = await request("GET", "/specimen-references/duplicates?institution_code=%20lacm%20&collection_code=%20ent%20&catalog_number=%2012345%20");
  assert.deepEqual(exact.body.map((row) => row.id), [ent.id]);
  assert.equal(exact.body[0].collection_code, "ENT");
  for (const suffix of ["", "&collection_code="]) {
    const fallback = await request("GET", `/specimen-references/duplicates?institution_code=LACM&catalog_number=12345${suffix}`);
    assert.deepEqual(fallback.body.map((row) => row.id), [ent.id, other.id, legacy.id]);
    assert.equal(fallback.body.find((row) => row.id === legacy.id).collection_code, null);
  }
  assert.equal((await request("GET", "/specimen-references/duplicates?institution_code=LACM&collection_code=OTHER&catalog_number=12345")).body.length, 0);
});

test("description and raw specimen provenance retain collection code and free-text label independently", async () => {
  const specimenId = await createSpecimen();
  await request("PATCH", `/specimen-references/${specimenId}`, { collection_code: "ENT", specimen_label: "Independently descriptive label" });
  await linkSpecimen(specimenId);
  const assertion = await assertObservation(specimenId);
  assert.equal(assertion.specimen_reference.collection_code, "ENT");
  await put(1, { state_ids: [1] });
  await specimenEvidence([assertion.id]);
  const description = await detail();
  assert.equal(description.body.specimen_references[0].collection_code, "ENT");
  assert.equal(description.body.specimen_references[0].specimen_label, "Independently descriptive label");
  assert.equal(description.body.character_observations[0].specimen_evidence[0].specimen_reference.collection_code, "ENT");
});

test("cache and live imports normalize redundant identities including user-supplied overrides", async (t) => {
  await seedOccurrence({ catalog_number: "LACM ENT 093601" });
  mockLive(t, [{ ...liveOccurrence, catalogNumber: "LACM ENT 093601" }]);
  for (const source of ["cache", "live_gbif"]) {
    const result = (await specimenLookup("4021395742", source)).body.results[0];
    assert.equal(result.catalog_number, "093601");
    assert.equal(result.institution_code, "LACM");
    assert.equal(result.collection_code, "ENT");
  }
  const result = await request("POST", "/specimen-references/import", {
    gbif_occurrence_key: "4021395742", catalog_number: "LACM ENT 093601",
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.specimen.catalog_number, "093601");
  assert.equal(result.body.specimen.specimen_label, null);
  const [stored] = await query("SELECT * FROM specimen_references WHERE id = ?", [result.body.specimen.id]);
  assert.equal(stored.catalog_number, "093601");
  // Legacy records are compared through the same normalizer without a migration.
  await query("INSERT INTO specimen_references (reference_type, species_id, institution_code, collection_code, catalog_number) VALUES ('local',1,'LACM','ENT','LACM ENT 093601')");
  for (const catalog of ["093601", "LACM ENT 093601"]) {
    const duplicates = await request("GET", `/specimen-references/duplicates?${new URLSearchParams({ institution_code: "LACM", collection_code: "ENT", catalog_number: catalog })}`);
    assert.equal(duplicates.body.length, 2);
  }
});

test("live fallback import stores normalized identity without a label", async (t) => {
  mockLive(t, [{ ...liveOccurrence, catalogNumber: "LACM ENT 093601" }]);
  const result = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742" });
  assert.equal(result.status, 200);
  assert.equal(result.body.specimen.catalog_number, "093601");
  assert.equal(result.body.specimen.specimen_label, null);
});

test("cached species binomial supplies missing name components for exact global matching", async () => {
  await query("UPDATE species SET genus='Myriophora', specific_epithet='kungae', gbif_taxon_key=NULL WHERE id=1");
  await seedOccurrence({ species: "Myriophora kungae", genus: null, specific_epithet: null, species_key: null, taxon_key: null });
  const candidate = (await specimenLookup("LACM")).body.results[0];
  assert.equal(candidate.species_suggestion.id, "1");
  assert.equal(candidate.species_match, "scientific_name");
  assert.equal(candidate.genus, "Myriophora");
  assert.equal(candidate.specific_epithet, "kungae");
});

test("GBIF source identity is protected while reassignment and curated metadata preserve evidence", async () => {
  await seedOccurrence();
  const imported = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742" });
  const id = imported.body.specimen.id;
  await linkSpecimen(id);
  const observation = await assertObservation(id);
  await put(1, { state_ids: [1] });
  await specimenEvidence([observation.id]);
  const tables = ["specimen_observations", "specimen_observation_states", "description_specimens", "character_observations", "character_observation_specimen_evidence"];
  const before = await Promise.all(tables.map((table) => query(`SELECT * FROM ${table}`)));
  for (const change of [
    { institution_code: "OTHER" }, { collection_code: "DIP" }, { catalog_number: "999" },
    { gbif_occurrence_key: "12345678" }, { gbif_occurrence_key: null },
    { reference_type: "local" }, { reference_type: "publication" },
    { notes: "Must roll back", catalog_number: "999" },
  ]) {
    const result = await request("PATCH", `/specimen-references/${id}`, change);
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.match(result.body.error, /source identity/);
  }
  const working = await createWorkingSpecies();
  await request("PUT", `/workspaces/1/specimens/${id}/identification`, { species_id: working.id });
  const result = await request("PATCH", `/specimen-references/${id}`, { specimen_label: "Local label", notes: "Local interpretation" });
  assert.equal(result.status, 200);
  assert.equal(result.body.species_id, null);
  assert.equal(result.body.specimen_label, "Local label");
  assert.equal(result.body.notes, "Local interpretation");
  for (const field of ["institution_code", "collection_code", "catalog_number", "gbif_occurrence_key", "reference_type"]) assert.equal(result.body[field], imported.body.specimen[field]);
  assert.deepEqual(await Promise.all(tables.map((table) => query(`SELECT * FROM ${table}`))), before);
});

test("GBIF import rejects source identity overrides", async () => {
  await seedOccurrence();
  for (const change of [{ institution_code: "OTHER" }, { collection_code: "DIP" }, { catalog_number: "999" }]) {
    const result = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742", ...change });
    assert.equal(result.status, 409);
  }
  assert.deepEqual(await query("SELECT * FROM specimen_references"), []);
});

const identificationUrl = (workspaceId, specimenId) => `/workspaces/${workspaceId}/specimens/${specimenId}/identification`;
test("workspace identifications are independent current interpretations with transactional membership", async () => {
  const id = await createSpecimen();
  const working = await createWorkingSpecies();
  const a = await request("PUT", identificationUrl(1, id), { species_id: "1", notes: "Workspace A" });
  const b = await request("PUT", identificationUrl(2, id), { species_id: working.id, notes: "Workspace B" });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(b.body.identified_by_uid, "editor");
  assert.equal(b.body.species.species_status, "work_in_progress");
  assert.equal((await request("GET", identificationUrl(1, id))).body.species_id, "1");
  const changed = await request("PUT", identificationUrl(1, id), { species_id: working.id });
  assert.equal(changed.body.notes, "Workspace A");
  assert.equal((await request("GET", identificationUrl(2, id))).body.notes, "Workspace B");
  await request("PUT", identificationUrl(1, id), { species_id: working.id }); // retry is an update
  assert.equal((await query("SELECT * FROM workspace_specimen_identifications")).length, 2);
  assert.equal((await query("SELECT * FROM workspace_species WHERE workspace_id=1")).length, 2);
  assert.equal((await query("SELECT * FROM workspace_species WHERE workspace_id=2")).length, 2);
  assert.equal((await query("SELECT * FROM specimen_references WHERE id=?", [id]))[0].species_id, null);
  assert.equal((await request("DELETE", `/workspaces/1/species/${working.id}`)).status, 409);
});

test("legacy assignments remain readable but never fall back into workspace identification", async () => {
  const id = await createSpecimen();
  await query("UPDATE specimen_references SET species_id=1 WHERE id=?", [id]); // historical fixture
  const working = await createWorkingSpecies();
  const assigned = await request("PUT", identificationUrl(1, id), { species_id: working.id });
  assert.equal(assigned.status, 200);
  for (const workspaceId of [1, 2]) {
    const result = await request("GET", `/specimen-references/${id}?workspace_id=${workspaceId}`);
    assert.equal(result.body.legacy_species.id, "1");
    assert.equal(result.body.species_id, "1");
    assert.equal(result.body.workspace_identification?.species_id || null, workspaceId === 1 ? working.id : null);
  }
  assert.equal((await request("PATCH", `/specimen-references/${id}`, { species_id: working.id })).status, 400);
  assert.equal((await request("POST", "/specimen-references", { reference_type: "local", species_id: "1" })).status, 400);
});

test("workspace identification search annotates the global universe and supports future Data Entry filtering", async () => {
  const id = await createSpecimen();
  const other = (await request("POST", "/specimen-references", { reference_type: "local", specimen_label: "Another" })).body.id;
  await request("PUT", identificationUrl(1, id), { species_id: "1" });
  for (const workspace of [1, 2]) {
    const result = await request("GET", `/specimen-references/search?q=&workspace_id=${workspace}`);
    assert.deepEqual(result.body.map((row) => row.id).sort(), [id, other].sort());
    assert.equal(result.body.find((row) => row.id === id).workspace_identification?.species_id || null, workspace === 1 ? "1" : null);
  }
  assert.equal((await request("GET", "/specimen-references/search?q=&workspace_id=1&species_id=1")).body.length, 1);
  assert.equal((await request("GET", "/specimen-references/search?q=&workspace_id=2&species_id=1")).body.length, 0);
  assert.equal((await request("GET", "/specimen-references/search?q=&species_id=1")).status, 400);
});

test("workspace identification validates ownership context, species and authenticated attribution", async () => {
  const id = await createSpecimen();
  for (const [url, data, expected] of [
    [identificationUrl(999, id), { species_id: "1" }, 404],
    [identificationUrl(1, 999), { species_id: "1" }, 404],
    [identificationUrl(1, id), { species_id: "999" }, 404],
    [identificationUrl(1, id), { species_id: null }, 400],
    [identificationUrl(1, id), { species_id: "1", identified_by_uid: "forged" }, 400],
    [identificationUrl("bad", id), { species_id: "1" }, 400],
  ]) assert.equal((await request("PUT", url, data)).status, expected);
  assert.equal((await request("GET", identificationUrl(1, id))).body, null);
  assert.deepEqual(await query("SELECT * FROM workspace_specimen_identifications"), []);
});

test("identification preserves all observation, publication, description and evidence provenance", async () => {
  const id = await createSpecimen();
  await linkSpecimen(id);
  await query("INSERT INTO publications (id,citation) VALUES (1,'Historical scorer')");
  await request("POST", "/descriptions/1/publications", { publication_id: "1" });
  await request("POST", `/descriptions/1/specimens/${id}/publications`, { publication_id: "1" });
  const observation = await assertObservation(id, { source_publication_id: "1" });
  await put(1, { state_ids: [1] });
  await specimenEvidence([observation.id]);
  const tables = ["specimen_references", "specimen_observations", "specimen_observation_states", "description_specimens", "description_specimen_publications", "character_observations", "observation_states", "character_observation_specimen_evidence", "description_publications", "publications", "species_descriptions"];
  const before = await Promise.all(tables.map((table) => query(`SELECT * FROM ${table}`)));
  const working = await createWorkingSpecies();
  await request("PUT", identificationUrl(1, id), { species_id: working.id });
  await request("PUT", identificationUrl(2, id), { species_id: "1" });
  assert.deepEqual(await Promise.all(tables.map((table) => query(`SELECT * FROM ${table}`))), before);
});

test("GBIF suggestion acceptance atomically creates species, voucher, workspace identification and membership", async (t) => {
  await seedOccurrence({ species: "Myriophora kungae", specific_epithet: "kungae", species_key: null });
  t.mock.method(gbifTaxonomy, "search", async () => [{ importable: true, genus: "Myriophora", specific_epithet: "kungae", col_xr_taxon_key: "KUNGAE" }]);
  t.mock.method(gbifTaxonomy, "resolveSpecies", async () => ({ genus: "Myriophora", specific_epithet: "kungae", species_status: "published", col_xr_taxon_key: "KUNGAE", gbif_taxon_key: null }));
  const values = { gbif_occurrence_key: "4021395742", workspace_id: "1", accept_gbif_identification: true, identification_notes: "Reviewed suggestion" };
  const first = await request("POST", "/specimen-references/import", values);
  assert.equal(first.status, 200, JSON.stringify(first));
  const specimen = first.body.specimen;
  assert.equal(specimen.species_id, null);
  assert.equal(specimen.workspace_identification.species.specific_epithet, "kungae");
  assert.equal(specimen.workspace_identification.notes, "Reviewed suggestion");
  const speciesId = specimen.workspace_identification.species_id;
  assert.equal((await query("SELECT * FROM workspace_species WHERE workspace_id=1 AND species_id=?", [speciesId])).length, 1);
  const retry = await request("POST", "/specimen-references/import", values);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.created, false);
  assert.equal(retry.body.specimen.id, specimen.id);
  assert.equal((await query("SELECT * FROM workspace_specimen_identifications")).length, 1);
  assert.equal((await query("SELECT * FROM species WHERE col_xr_taxon_key='KUNGAE'")).length, 1);
  const working = await createWorkingSpecies();
  const overridden = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742", workspace_id: "2", species_id: working.id });
  assert.equal(overridden.body.specimen.workspace_identification.species_id, working.id);
  assert.equal((await request("GET", identificationUrl(1, specimen.id))).body.species_id, speciesId);
});

test("existing global suggestion is reused and no workspace means no species import or identification", async (t) => {
  await seedOccurrence();
  await query("UPDATE species SET genus='Myriophora', specific_epithet='wellsorum', gbif_taxon_key='9608828' WHERE id=1");
  const resolve = t.mock.method(gbifTaxonomy, "resolveSpecies", async () => { throw new Error("Should reuse global record"); });
  const first = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742" });
  assert.equal(first.status, 200);
  assert.equal(first.body.specimen.species_id, null);
  assert.deepEqual(await query("SELECT * FROM workspace_specimen_identifications"), []);
  const accepted = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742", workspace_id: "1", accept_gbif_identification: true });
  assert.equal(accepted.body.specimen.workspace_identification.species_id, "1");
  assert.equal(resolve.mock.callCount(), 0);
});

test("membership or identification failure rolls back the entire manual/import workflow", async (t) => {
  const working = await createWorkingSpecies();
  const original = db.query;
  t.mock.method(db, "query", async (sql, params) => {
    if (sql.startsWith("INSERT INTO workspace_specimen_identifications")) throw new Error("Injected identification failure");
    return original(sql, params);
  });
  const created = await request("POST", "/specimen-references", { reference_type: "local", workspace_id: "1", species_id: working.id });
  assert.equal(created.status, 500);
  assert.deepEqual(await query("SELECT * FROM specimen_references"), []);
  assert.deepEqual(await query("SELECT * FROM workspace_species WHERE species_id=?", [working.id]), []);
  await seedOccurrence();
  t.mock.method(gbifTaxonomy, "search", async () => [{ importable: true, genus: "Myriophora", specific_epithet: "wellsorum", col_xr_taxon_key: "NEW" }]);
  t.mock.method(gbifTaxonomy, "resolveSpecies", async () => ({ genus: "Myriophora", specific_epithet: "wellsorum", col_xr_taxon_key: "NEW", gbif_taxon_key: null }));
  const imported = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742", workspace_id: "1", accept_gbif_identification: true });
  assert.equal(imported.status, 500);
  assert.deepEqual(await query("SELECT * FROM specimen_references"), []);
  assert.deepEqual(await query("SELECT * FROM species WHERE col_xr_taxon_key='NEW'"), []);
});

test("external snapshot and explicit live GBIF names never overwrite workspace interpretation", async (t) => {
  await seedOccurrence({ accepted_scientific_name: "Myriophora kungae" });
  const global = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742" });
  const id = global.body.specimen.id;
  const working = await createWorkingSpecies();
  await request("PUT", identificationUrl(1, id), { species_id: working.id });
  const fetch = mockLive(t, [{ ...liveOccurrence, species: "Myriophora changed", specificEpithet: "changed" }]);
  const list = await request("GET", "/specimen-references/search?q=&workspace_id=1");
  assert.equal(list.body[0].external_taxonomy.accepted_scientific_name, "Myriophora kungae");
  assert.equal(fetch.mock.callCount(), 0);
  const cache = await request("GET", `/specimen-references/${id}/external-taxonomy`);
  assert.equal(cache.body.source, "cache");
  const live = await request("GET", `/specimen-references/${id}/external-taxonomy?source=live_gbif`);
  assert.equal(live.body.taxonomy.accepted_scientific_name, "Myriophora changed");
  assert.equal((await request("GET", identificationUrl(1, id))).body.species_id, working.id);
});

test("manual creation records only a workspace interpretation and accepts WIP species", async () => {
  const working = await createWorkingSpecies();
  const result = await request("POST", "/specimen-references", { reference_type: "local", institution_code: "TEST", catalog_number: "001", workspace_id: "1", species_id: working.id, identification_notes: "Provisional" });
  assert.equal(result.status, 201);
  assert.equal(result.body.species_id, null);
  assert.equal(Object.hasOwn(result.body, "workspace_id"), false);
  assert.equal(result.body.workspace_identification.species.working_name, "AZ-17");
  assert.equal(result.body.workspace_identification.notes, "Provisional");
  assert.equal((await query("SELECT * FROM workspace_species WHERE workspace_id=1 AND species_id=?", [working.id])).length, 1);
  assert.equal((await request("GET", identificationUrl(2, result.body.id))).body, null);
  assert.equal((await request("GET", `/specimen-references/${result.body.id}?workspace_id=bad`)).status, 400);
});

const workspaceSpecimens = (id, q = "") => request("GET", `/workspaces/${id}/specimens?${new URLSearchParams({ q })}`);
test("normal workspace list joins identifications without changing global voucher identity", async () => {
  const id = await createSpecimen();
  const working = await createWorkingSpecies();
  await request("PUT", identificationUrl(1, id), { species_id: "1" });
  const usa = await workspaceSpecimens(1);
  assert.equal(usa.status, 200);
  assert.deepEqual(usa.body.map((row) => row.id), [id]);
  assert.equal(usa.body[0].workspace_identification.species_id, "1");
  assert.equal(usa.body[0].observation_count, 0);
  assert.deepEqual((await workspaceSpecimens(2)).body, []);
  assert.equal((await request("GET", "/specimen-references/search?q=TEST&workspace_id=2")).body[0].id, id);
  await request("PUT", identificationUrl(2, id), { species_id: working.id });
  assert.equal((await workspaceSpecimens(2)).body[0].workspace_identification.species.working_name, "AZ-17");
  assert.equal((await workspaceSpecimens(1)).body[0].workspace_identification.species_id, "1");
  await request("PUT", identificationUrl(1, id), { species_id: working.id });
  assert.equal((await workspaceSpecimens(2)).body[0].workspace_identification.species_id, working.id);
  await query("DELETE FROM workspace_specimen_identifications WHERE workspace_id=1 AND specimen_reference_id=?", [id]);
  assert.deepEqual((await workspaceSpecimens(1)).body, []);
  assert.equal((await workspaceSpecimens(2)).body[0].id, id);
  assert.equal((await query("SELECT * FROM specimen_references")).length, 1);
  assert.equal((await query("SELECT * FROM workspace_species WHERE workspace_id=2 AND species_id=?", [working.id])).length, 1);
});

test("workspace list search cannot return another workspace's or an unassigned voucher", async () => {
  const create = async (catalog) => (await request("POST", "/specimen-references", { reference_type: "local", institution_code: "LACM", catalog_number: catalog })).body.id;
  const usa = await create("USA-001"), canada = await create("CAN-001");
  await create("GLOBAL-001");
  const working = await createWorkingSpecies();
  await request("PUT", identificationUrl(1, usa), { species_id: "1" });
  await request("PUT", identificationUrl(2, canada), { species_id: working.id });
  assert.deepEqual((await workspaceSpecimens(1, "LACM")).body.map((row) => row.id), [usa]);
  assert.deepEqual((await workspaceSpecimens(2, "LACM")).body.map((row) => row.id), [canada]);
  assert.deepEqual((await workspaceSpecimens(2, "USA-001")).body, []);
  assert.deepEqual((await workspaceSpecimens(1, "GLOBAL-001")).body, []);
  assert.equal((await workspaceSpecimens(2, "AZ-17")).body[0].id, canada);
  assert.deepEqual((await workspaceSpecimens(1, "%")).body, []);
  assert.equal((await workspaceSpecimens("bad")).status, 400);
  assert.equal((await workspaceSpecimens(999)).status, 404);
  assert.equal((await workspaceSpecimens(1, "x".repeat(201))).status, 400);
});

test("reuse through global registry or GBIF creates another workspace identification, never another voucher", async () => {
  await seedOccurrence({ catalog_number: "239648", accepted_scientific_name: "Myriophora smithi" });
  const first = await request("POST", "/specimen-references/import", { gbif_occurrence_key: "4021395742", workspace_id: "1", species_id: "1" });
  const id = first.body.specimen.id;
  assert.deepEqual((await workspaceSpecimens(2)).body, []);
  const registry = await request("GET", "/specimen-references/search?q=239648&workspace_id=2");
  assert.equal(registry.body[0].id, id);
  assert.equal(registry.body[0].workspace_identification, null);
  assert.equal(registry.body[0].external_taxonomy.accepted_scientific_name, "Myriophora smithi");
  const before = await request("GET", "/lookup/gbif/specimens?q=239648&workspace_id=2", undefined, "admin", readRouter);
  assert.equal(before.body.results[0].existing_specimen_id, id);
  assert.equal(before.body.results[0].workspace_identification, null);
  const working = await createWorkingSpecies();
  await request("PUT", identificationUrl(2, id), { species_id: working.id });
  const after = await request("GET", "/lookup/gbif/specimens?q=239648&workspace_id=2", undefined, "admin", readRouter);
  assert.equal(after.body.results[0].workspace_identification.species_id, working.id);
  assert.equal((await workspaceSpecimens(2)).body[0].id, id);
  assert.equal((await workspaceSpecimens(1)).body[0].workspace_identification.species_id, "1");
  assert.equal((await query("SELECT * FROM specimen_references")).length, 1);
  assert.equal((await query("SELECT * FROM workspace_specimen_identifications WHERE workspace_id=2")).length, 1);
  assert.equal((await query("SELECT * FROM workspace_species WHERE workspace_id=2 AND species_id=?", [working.id])).length, 1);
});
