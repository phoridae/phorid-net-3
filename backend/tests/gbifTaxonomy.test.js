const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../services/gbifTaxonomy");
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const classification = [{ rank: "FAMILY", name: "Phoridae" }];
const usage = { key: "FQL6", canonicalName: "Apocephalus gemellus", name: "Apocephalus gemellus Borgmeier", rank: "SPECIES", status: "ACCEPTED", genericName: "Apocephalus", specificEpithet: "gemellus" };
const match = (key = "FQL6") => ({ usage: { ...usage, key }, classification, synonym: false, diagnostics: { matchType: "EXACT" } });
function sequence(data) {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(new URL(url));
    const result = data.shift();
    if (result instanceof Error) throw result;
    return { ok: true, json: async () => result };
  };
  return urls;
}
const searchRow = (id = "FQL6") => ({ usage: { id, name: { scientificName: "Apocephalus gemellus", rank: "species", genus: "Apocephalus", specificEpithet: "gemellus" }, status: "accepted" }, classification });

test("COL XR search normalizes names/identifiers, excludes non-Phoridae and keeps synonym attribution", async () => {
  const synonym = searchRow("87Q6H");
  synonym.usage.status = "synonym";
  synonym.usage.accepted = { id: "FQL6", name: { scientificName: "Apocephalus (Apocephalus) gemellus" } };
  const urls = sequence([{ result: [searchRow(), { ...searchRow("OTHER"), classification: [{ rank: "family", name: "Felidae" }] }, synonym, null] }]);
  const result = await service.search("Apocephalus");
  assert.equal(result.length, 2);
  assert.equal(result[0].col_xr_taxon_key, "FQL6");
  assert.equal(result[0].gbif_taxon_key, null);
  assert.equal(result[0].importable, true);
  assert.equal(result[1].accepted_col_xr_taxon_key, "FQL6");
  assert.match(result[1].accepted_name, /gemellus/);
  assert.equal(result[1].importable, false);
  assert.equal(urls[0].host, "api.checklistbank.org");
  assert.equal(urls[0].pathname, "/dataset/3LXR/nameusage/search");
  assert.equal(urls[0].searchParams.get("rank"), "species");
});

test("genus lookup is rank constrained and uses standardized uninomial names", async () => {
  const row = searchRow("BXYN7");
  row.usage.name = { scientificName: "Apocephalus", uninomial: "Apocephalus", rank: "genus" };
  const urls = sequence([{ result: [row, searchRow()] }]);
  const result = await service.search("Apoc", "GENUS");
  assert.equal(result.length, 1);
  assert.equal(result[0].genus, "Apocephalus");
  assert.equal(urls[0].searchParams.get("rank"), "genus");
});

test("final v2 COL identity is revalidated and legacy key requires round-trip identifier mapping", async () => {
  const urls = sequence([match(), match("1545474"), match()]);
  assert.deepEqual(await service.resolveSpecies("FQL6"), { genus: "Apocephalus", specific_epithet: "gemellus", species_status: "published", col_xr_taxon_key: "FQL6", gbif_taxon_key: "1545474" });
  assert.equal(urls[0].pathname, "/v2/species/match");
  assert.equal(urls[0].searchParams.get("scientificNameID"), "col:FQL6");
  assert.equal(urls[0].searchParams.get("checklistKey"), service.COL_XR);
  assert.equal(urls[1].searchParams.get("checklistKey"), service.BACKBONE);
  assert.equal(urls[2].searchParams.get("scientificNameID"), "gbif:1545474");
});

test("unreliable or unavailable legacy mapping leaves gbif_taxon_key null", async () => {
  sequence([match(), match("1545474"), match("OTHER")]);
  assert.equal((await service.resolveSpecies("FQL6")).gbif_taxon_key, null);
  sequence([match(), new Error("Legacy unavailable")]);
  assert.equal((await service.resolveSpecies("FQL6")).gbif_taxon_key, null);
});

test("rejects fuzzy, wrong-family, wrong-rank, synonym and changed-ID imports", async () => {
  for (const result of [
    { ...match(), diagnostics: { matchType: "FUZZY" } },
    { ...match(), classification: [{ rank: "FAMILY", name: "Felidae" }] },
    { ...match(), usage: { ...usage, rank: "GENUS" } },
    { ...match(), synonym: true }, match("OTHER"),
  ]) {
    sequence([result]);
    await assert.rejects(service.resolveSpecies("FQL6"), { status: 400 });
  }
});

test("external HTTP, timeout and malformed-response failures are controlled", async () => {
  global.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(service.search("Apocephalus"), { status: 502 });
  sequence([Object.assign(new Error("timeout"), { name: "TimeoutError" })]);
  await assert.rejects(service.search("Apocephalus"), { status: 504 });
  sequence([{}]);
  await assert.rejects(service.search("Apocephalus"), { status: 502 });
});
