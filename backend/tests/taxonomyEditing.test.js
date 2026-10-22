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
require.cache[require.resolve("../dbTaxonomy")] = { exports: { getConnection: async () => { acquired++; return db; } } };
require.cache[require.resolve("../services/firebaseAdmin")] = { exports: {
  auth: () => ({ verifyIdToken: async (token) => ({ uid: "editor", admin: token === "admin" }) }),
} };
const router = require("../routes/taxonomyEditing");
beforeEach(async () => { await call("reset"); injectFailure = false; });
function request(method, url, body, token = "admin") {
  return new Promise((resolve) => {
    const req = { method, url, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { resolve({ status: this.statusCode, body: value }); },
      end() { resolve({ status: this.statusCode }); },
    };
    router.handle(req, res, (error) => resolve({ status: error ? 500 : 404, error }));
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
  await query("INSERT INTO key_descriptions VALUES (1,1)");
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

test("descriptions require species membership and unique workspace/species/sex", async () => {
  const created = await request("POST", "/descriptions", { workspace_id: 1, species_id: 1, sex_scope: "male", diagnosis: "Original" });
  assert.equal(created.status, 201);
  assert.equal(created.body.prepared_by_uid, "editor");
  const changed = await request("PATCH", `/descriptions/${created.body.id}`, { diagnosis: "Revised", remarks: null });
  assert.equal(changed.body.diagnosis, "Revised");
  assert.equal(changed.body.sex_scope, "male");
  assert.equal((await request("PATCH", `/descriptions/${created.body.id}`, { sex_scope: "female" })).status, 409);
  assert.equal((await request("PATCH", `/descriptions/${created.body.id}`, { workspace_id: 2 })).status, 400);
  assert.equal((await request("POST", "/descriptions", { workspace_id: 1, species_id: 999 })).status, 404);
  await query("INSERT INTO species (id, genus, specific_epithet) VALUES (2, 'Testphora', 'beta')");
  await query("INSERT INTO workspace_species VALUES (2,2,0)");
  const notAssigned = await request("POST", "/descriptions", { workspace_id: 1, species_id: 2 });
  assert.equal(notAssigned.status, 404);
  assert.deepEqual(notAssigned.body, { error: "Species is not a member of this workspace" });
  assert.equal((await request("POST", "/descriptions", { workspace_id: 1, species_id: 1, sex_scope: "female" })).status, 409);
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
  await query("INSERT INTO publications VALUES (1)");
  await query("INSERT INTO specimen_references VALUES (1,1)");
  await query("INSERT INTO description_publications VALUES (1,1)");
  await query("INSERT INTO description_specimens VALUES (1,1)");
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
  await query("INSERT INTO key_descriptions VALUES (1,1)");
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
  await query("INSERT INTO key_characters VALUES (1,1)");
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
