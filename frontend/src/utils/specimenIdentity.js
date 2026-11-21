// Shared with the backend: keep structured identity rules identical at every boundary.
const clean = (value) => value == null ? null : String(value).trim() || null;
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizeSpecimenIdentity(row) {
  const institution_code = clean(row.institution_code);
  const collection_code = clean(row.collection_code);
  let catalog_number = clean(row.catalog_number);
  const original = catalog_number;
  // Match whole leading codes, in institution/collection order, once each.
  // Require a separator and a nonempty remainder; never strip embedded substrings.
  for (const code of [institution_code, collection_code].filter(Boolean)) {
    if (!catalog_number) break;
    const match = catalog_number.match(new RegExp(`^${escape(code)}[\\s.,:;/_-]+(.+)$`, "i"));
    if (match && /[\p{L}\p{N}]/u.test(match[1])) catalog_number = match[1].trim();
  }
  // Codes alone, repeated codes, or reversed code sequences do not clearly
  // identify a catalog suffix. Preserve these ambiguous cases in full.
  if (catalog_number !== original && [institution_code, collection_code].filter(Boolean).some((code) =>
    new RegExp(`^${escape(code)}(?:[\\s.,:;/_-]|$)`, "i").test(catalog_number))) catalog_number = original;
  return { institution_code, collection_code, catalog_number };
}

module.exports = { normalizeSpecimenIdentity };
