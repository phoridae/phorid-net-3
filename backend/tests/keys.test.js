const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

// Exercise the actual SQL against an isolated SQLite fixture. These read queries
// use SQL supported by both SQLite and MySQL; no live credentials are needed.
const directory = mkdtempSync(path.join(tmpdir(), "phorid-keys-"));
const database = path.join(directory, "fixture.sqlite");
after(() => rmSync(directory, { recursive: true, force: true }));
function sql(statement) {
  const result = spawnSync("sqlite3", ["-json", database], { input: statement, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "[]");
}
sql(`
  CREATE TABLE identification_keys (id TEXT, name TEXT, status TEXT, source_publication_id TEXT);
  INSERT INTO identification_keys VALUES ('1','Draft','draft',NULL), ('2','Published','published','9007199254740993'), ('3','Empty','draft',NULL);
  CREATE TABLE characters (id TEXT, name TEXT, data_type TEXT);
  INSERT INTO characters VALUES ('10','Setae','categorical'), ('11','Color','categorical'), ('12','Length','numeric_range');
  CREATE TABLE key_characters (key_id TEXT, character_id TEXT, display_order INTEGER, notes TEXT, created_at TEXT);
  INSERT INTO key_characters VALUES ('1','10',1,NULL,NULL), ('1','11',2,NULL,NULL), ('1','12',3,NULL,NULL);
  CREATE TABLE character_states (id TEXT, character_id TEXT, name TEXT, description TEXT, display_order INTEGER, created_at TEXT, updated_at TEXT);
  INSERT INTO character_states VALUES ('20','10','Bare',NULL,1,NULL,NULL), ('21','10','Setose',NULL,2,NULL,NULL),
    ('22','11','Yellow',NULL,1,NULL,NULL), ('23','11','Black',NULL,2,NULL,NULL);
  CREATE TABLE key_descriptions (key_id TEXT, description_id TEXT, notes TEXT, created_at TEXT);
  INSERT INTO key_descriptions VALUES ('1','100',NULL,NULL), ('1','101',NULL,NULL), ('1','102',NULL,NULL),
    ('1','103',NULL,NULL), ('1','104',NULL,NULL), ('2','100',NULL,NULL), ('2','102',NULL,NULL);
  CREATE TABLE species_descriptions (id TEXT, workspace_id TEXT, species_id TEXT, sex_scope TEXT);
  INSERT INTO species_descriptions VALUES ('100','1','50','female'), ('101','2','51','female'),
    ('102','2','52','female'), ('103','1','50','male'), ('104','2','51','male'), ('105','1','50','general');
  CREATE TABLE workspaces (id TEXT, name TEXT);
  INSERT INTO workspaces VALUES ('1','Canada'), ('2','USA');
  CREATE TABLE species (id TEXT, gbif_taxon_key TEXT, genus TEXT, specific_epithet TEXT, species_status TEXT, working_name TEXT);
  INSERT INTO species VALUES ('50','9007199254740993','Testphora','a','published',NULL),
    ('51',NULL,'Testphora','b','published',NULL), ('52',NULL,'Testphora',NULL,'work_in_progress','Prairie 1');
  CREATE TABLE character_observations (id TEXT, description_id TEXT, character_id TEXT, numeric_min NUMERIC, numeric_max NUMERIC);
  INSERT INTO character_observations VALUES ('1','100','10',NULL,NULL), ('2','100','11',NULL,NULL), ('3','100','12',1.5,1.8),
    ('4','101','10',NULL,NULL), ('5','101','11',NULL,NULL), ('6','101','12',1.7,2.0),
    ('7','102','10',NULL,NULL), ('8','102','11',NULL,NULL), ('9','102','12',1.6,1.9),
    ('10','104','10',NULL,NULL), ('11','104','12',NULL,1.6);
  CREATE TABLE observation_states (observation_id TEXT, character_id TEXT, state_id TEXT);
  INSERT INTO observation_states VALUES ('1','10','20'), ('2','11','23'), ('4','10','21'), ('5','11','22'),
    ('7','10','20'), ('7','10','21'), ('8','11','23');
`);

let queryCount = 0;
let failDatabase = false;
require.cache[require.resolve("../dbTaxonomy")] = { exports: {
  async query(statement, params = []) {
    queryCount++;
    if (failDatabase) throw new Error("Database unavailable");
    let index = 0;
    const expanded = statement.replace(/\?/g, () => {
      const value = params[index++];
      return typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
    });
    assert.equal(index, params.length);
    return [sql(expanded)];
  },
} };
require.cache[require.resolve("../services/firebaseAdmin")] = { exports: {
  auth: () => ({ verifyIdToken: async (token) => ({ admin: token === "admin" }) }),
} };
const router = require("../routes/keys");

function request(method, url, body, token = "admin") {
  return new Promise((resolve) => {
    const req = { method, url, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { resolve({ status: this.statusCode, body: value }); },
    };
    router.handle(req, res, (error) => resolve({ status: error ? 500 : 404, error }));
  });
}
const candidateIds = (response) => response.body.map((row) => row.id).sort();
const filter = (filters) => request("POST", "/1/filter", { filters });

test("all five endpoints require admin before querying the database", async () => {
  for (const [method, url] of [["GET", "/"], ["GET", "/1"], ["GET", "/1/characters"], ["GET", "/1/candidates"], ["POST", "/1/filter"]]) {
    const before = queryCount;
    assert.equal((await request(method, url, undefined, null)).status, 401);
    assert.equal((await request(method, url, undefined, "member")).status, 403);
    assert.equal(queryCount, before);
  }
});

test("list, detail, ordered characters and states preserve IDs", async () => {
  assert.equal((await request("GET", "/")).body.length, 3);
  const detail = await request("GET", "/2");
  assert.equal(detail.body.source_publication_id, "9007199254740993");
  const characters = await request("GET", "/1/characters");
  assert.deepEqual(characters.body.map((row) => row.id), ["10", "11", "12"]);
  assert.deepEqual(characters.body[0].states.map((row) => row.id), ["20", "21"]);
  assert.deepEqual(characters.body[2].states, []);
});

test("invalid and missing keys, empty keys, database errors, and no CRUD", async () => {
  for (const url of ["/0", "/-1", "/1.5", "/abc", "/18446744073709551616"]) {
    assert.equal((await request("GET", url)).status, 400);
  }
  for (const suffix of ["", "/characters", "/candidates", "/filter"]) {
    assert.equal((await request(suffix === "/filter" ? "POST" : "GET", `/999${suffix}`, { filters: [] })).status, 404);
  }
  assert.deepEqual((await request("GET", "/3/characters")).body, []);
  assert.deepEqual((await request("GET", "/3/candidates")).body, []);
  assert.deepEqual((await request("POST", "/3/filter", { filters: [] })).body, []);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal((await request(method, method === "POST" ? "/" : "/1")).status, 404);
  }
  failDatabase = true;
  try { assert.equal((await request("GET", "/")).status, 500); }
  finally { failDatabase = false; }
});

test("candidates use selected descriptions across workspaces with published status enforcement", async () => {
  const response = await request("GET", "/1/candidates");
  assert.deepEqual(candidateIds(response), ["100", "101", "102", "103", "104"]);
  assert.deepEqual(new Set(response.body.map((row) => row.workspace_id)), new Set(["1", "2"]));
  assert.equal(response.body.find((row) => row.id === "100").gbif_taxon_key, "9007199254740993");
  assert.deepEqual(candidateIds(await request("GET", "/2/candidates")), ["100"]);
  assert.deepEqual(candidateIds(await request("POST", "/2/filter", { filters: [] })), ["100"]);
  assert.deepEqual(candidateIds(await filter([])), candidateIds(response));
});

test("categorical filtering handles OR, AND, polymorphism and unscored descriptions", async () => {
  assert.deepEqual(candidateIds(await filter([{ character_id: "10", state_ids: [20] }])), ["100", "102", "103", "104"]);
  assert.deepEqual(candidateIds(await filter([{ character_id: "10", state_ids: [20, "21"] }])), ["100", "101", "102", "103", "104"]);
  assert.deepEqual(candidateIds(await filter([
    { character_id: "10", state_ids: [20] }, { character_id: "11", state_ids: [22] },
  ])), ["103", "104"]);
});

test("numeric filtering uses inclusive overlap, open bounds and unknown values", async () => {
  assert.deepEqual(candidateIds(await filter([{ character_id: 12, min: 1.8, max: 1.8 }])), ["100", "101", "102", "103"]);
  assert.deepEqual(candidateIds(await filter([{ character_id: 12, min: 2.1 }])), ["103"]);
  assert.deepEqual(candidateIds(await filter([{ character_id: 12, max: 1.5 }])), ["100", "103", "104"]);
  assert.deepEqual(candidateIds(await filter([
    { character_id: 10, state_ids: [20] }, { character_id: 12, min: 1.85 },
  ])), ["102", "103"]);
});

test("reject malformed bodies, wrong character/state ownership, duplicate characters and invalid numeric ranges", async () => {
  for (const body of [null, [], {}, { filters: {} }, { filters: [], unexpected: true }]) {
    assert.equal((await request("POST", "/1/filter", body)).status, 400);
  }
  for (const filters of [
    [null], [{ character_id: "999", state_ids: [20] }],
    [{ character_id: 10, state_ids: [] }], [{ character_id: 10, state_ids: [22] }],
    [{ character_id: 10, state_ids: ["20 OR 1=1"] }],
    [{ character_id: 10, state_ids: [20], extra: true }],
    [{ character_id: 10, state_ids: [20] }, { character_id: 10, state_ids: [21] }],
    [{ character_id: 12 }], [{ character_id: 12, min: "1" }],
    [{ character_id: 12, min: 2, max: 1 }], [{ character_id: 12, min: Infinity }],
    [{ character_id: 12, state_ids: [20] }],
  ]) assert.equal((await filter(filters)).status, 400, JSON.stringify(filters));
});
