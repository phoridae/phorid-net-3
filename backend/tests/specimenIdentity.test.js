const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSpecimenIdentity } = require("../../frontend/src/utils/specimenIdentity");

for (const [catalog, institution, collection, expected] of [
  ["LACM ENT 093601", "LACM", "ENT", "093601"],
  ["LACM 093601", "LACM", null, "093601"],
  ["093601", "LACM", "ENT", "093601"],
  ["LACM: ENT / 093601", "LACM", "ENT", "093601"],
  ["ENT-093601", "LACM", "ENT", "093601"],
  ["lacm ent 093601", "LACM", "ENT", "093601"],
  ["LACMENT093601", "LACM", "ENT", "LACMENT093601"],
  ["OTHER LACM ENT 093601", "LACM", "ENT", "OTHER LACM ENT 093601"],
  ["LACM2 093601", "LACM", "ENT", "LACM2 093601"],
  ["LACM", "LACM", null, "LACM"],
  ["LACM ENT", "LACM", "ENT", "LACM ENT"],
  ["LACM LACM 001", "LACM", "ENT", "LACM LACM 001"],
  ["ENT LACM 001", "LACM", "ENT", "ENT LACM 001"],
  ["A+B 001", "A+B", null, "001"],
  ["AB 001", "A+B", null, "AB 001"],
]) test(`conservative identity normalization: ${catalog} (${institution}/${collection})`, () => {
  assert.deepEqual(normalizeSpecimenIdentity({ institution_code: institution, collection_code: collection, catalog_number: catalog }), {
    institution_code: institution, collection_code: collection, catalog_number: expected,
  });
});
