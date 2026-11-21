const { normalizeSpecimenIdentity } = require("../../frontend/src/utils/specimenIdentity");
const cache = require("../dbGbif");
const { COL_XR, BACKBONE } = require("./gbifTaxonomy");

const error = (status, message) => Object.assign(new Error(message), { status });
const string = (value) => value == null || value === "" ? null : String(value);
const numericKey = (value) => (typeof value !== "number" || Number.isSafeInteger(value)) && /^[1-9]\d{0,19}$/.test(String(value)) && BigInt(value) <= 18446744073709551615n ? String(value) : null;
const voucherTypes = ["PRESERVED_SPECIMEN", "FOSSIL_SPECIMEN", "LIVING_SPECIMEN", "MATERIAL_SAMPLE"];
const fields = ["scientific_name", "accepted_scientific_name", "species", "genus", "specific_epithet", "institution_code", "collection_code", "catalog_number", "recorded_by", "locality", "verbatim_locality", "state_province", "country", "CAST(gbifid AS CHAR)"];
const cacheColumns = `CAST(gbifid AS CHAR) AS gbifid, CAST(species_key AS CHAR) AS species_key,
  CAST(taxon_key AS CHAR) AS taxon_key, scientific_name, accepted_scientific_name, species,
  family, genus, specific_epithet, taxon_rank, institution_code, collection_code, catalog_number,
  recorded_by, locality, verbatim_locality, state_province, country, event_date, basis_of_record`;

function parseQuery(raw, { exact = false } = {}) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 200) throw error(400, "q must contain 1–200 characters");
  const q = raw.trim();
  // Short numeric strings are usually ambiguous catalog numbers. Imports already
  // carry an explicit occurrence ID and always bypass this search heuristic.
  return { q, key: exact || q.length >= 8 ? numericKey(q) : null, terms: q.split(/\s+/).slice(0, 8) };
}

function speciesUsage(classification) {
  const accepted = classification?.acceptedUsage || classification?.usage;
  if (accepted?.rank === "SPECIES") return accepted;
  return classification?.classification?.find((taxon) => taxon.rank === "SPECIES");
}
function normalize(row, source) {
  const live = source === "live_gbif";
  const col = live ? speciesUsage(row.classifications?.[COL_XR]) : null;
  const backbone = live ? speciesUsage(row.classifications?.[BACKBONE]) : null;
  const key = numericKey(live ? row.key : row.gbifid);
  if (!key) return null;
  const candidate = {
    gbif_occurrence_key: key,
    institution_code: string(live ? row.institutionCode : row.institution_code),
    collection_code: string(live ? row.collectionCode : row.collection_code),
    catalog_number: string(live ? row.catalogNumber : row.catalog_number),
    accepted_scientific_name: string(live ? col?.canonicalName || row.acceptedScientificName || row.species : row.accepted_scientific_name || row.species),
    scientific_name: string(live ? row.species || row.scientificName : row.species || row.scientific_name),
    genus: string(live ? col?.genericName || row.genus : row.genus),
    specific_epithet: string(live ? col?.specificEpithet || row.specificEpithet : row.specific_epithet),
    gbif_taxon_key: numericKey(live ? backbone?.key || row.speciesKey || (row.taxonRank === "SPECIES" ? row.taxonKey : null) : row.species_key || (row.taxon_rank === "SPECIES" ? row.taxon_key : null)),
    col_xr_taxon_key: string(col?.key),
    country: string(row.country), locality: string(live ? row.locality || row.stateProvince : row.locality || row.verbatim_locality || row.state_province),
    event_date: string(live ? row.eventDate : row.event_date), recorded_by: string(live ? row.recordedBy : row.recorded_by),
    basis_of_record: string(live ? row.basisOfRecord : row.basis_of_record), source,
    existing_specimen_id: null,
  };
  Object.assign(candidate, normalizeSpecimenIdentity(candidate));
  // Snapshot species often supplies the binomial while specific_epithet is empty.
  // Use only an explicit binomial (never infer from cf., aff., or higher ranks).
  const binomial = String(live ? col?.canonicalName || row.species || "" : row.species || row.accepted_scientific_name || "").trim();
  const parts = binomial.match(/^([A-Z][a-z]+) ([a-z][a-z-]+)$/);
  if (parts && !col?.genericName && !col?.specificEpithet) {
    candidate.genus = parts[1];
    candidate.specific_epithet = parts[2];
    candidate.scientific_name = binomial;
  }
  // Routine lookup surfaces specimen evidence, rather than unvouchered sightings.
  return voucherTypes.includes(candidate.basis_of_record) || candidate.catalog_number ? candidate : null;
}

async function searchCache(raw, options) {
  const { key, terms } = parseQuery(raw, options);
  try {
    let sql, params;
    if (key) {
      sql = `SELECT ${cacheColumns} FROM gbif_occurrence_phoridae WHERE gbifid = ?`;
      params = [key];
    } else {
      const patterns = terms.map((term) => `%${term.replace(/[!%_]/g, "!$&")}%`);
      const where = patterns.map(() => `(${fields.map((field) => `${field} LIKE ? ESCAPE '!'`).join(" OR ")})`).join(" AND ");
      const exactFields = ["institution_code", "collection_code", "catalog_number", "species", "genus"];
      const score = terms.map(() => exactFields.map((field) => `(CASE WHEN ${field} = ? THEN 1 ELSE 0 END)`).join(" + ")).join(" + ");
      sql = `SELECT ${cacheColumns} FROM gbif_occurrence_phoridae WHERE ${where}
        AND (basis_of_record IN ('PRESERVED_SPECIMEN','FOSSIL_SPECIMEN','LIVING_SPECIMEN','MATERIAL_SAMPLE') OR (catalog_number IS NOT NULL AND catalog_number <> ''))
        ORDER BY (${score}) DESC, CASE WHEN basis_of_record = 'PRESERVED_SPECIMEN' THEN 1 ELSE 0 END DESC, gbifid LIMIT 30`;
      params = [...patterns.flatMap((pattern) => fields.map(() => pattern)), ...terms.flatMap((term) => exactFields.map(() => term))];
    }
    const [rows] = await cache.query(sql, params);
    return rows.map((row) => normalize(row, "cache")).filter(Boolean);
  } catch (failure) {
    throw error(503, "The GBIF cache is unavailable. Search current GBIF or create a specimen manually.");
  }
}

async function getJson(path, params = {}) {
  const url = new URL(path, "https://api.gbif.org");
  url.search = new URLSearchParams({ ...params, checklistKey: BACKBONE }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
    if (response.status === 404) throw error(404, "GBIF occurrence not found");
    if (!response.ok) throw error(502, "Current GBIF is unavailable. Cached results and manual entry remain available.");
    const data = await response.json();
    if (!data || typeof data !== "object") throw error(502, "GBIF returned an unexpected response");
    return data;
  } catch (failure) {
    if (failure.status) throw failure;
    throw error(failure.name === "TimeoutError" ? 504 : 502, "Current GBIF lookup failed. Cached results and manual entry remain available.");
  }
}

async function searchLive(raw, options) {
  const { q, key } = parseQuery(raw, options);
  let rows;
  if (key) {
    try { rows = [await getJson(`/v1/occurrence/${key}`)]; }
    catch (failure) { if (failure.status === 404) return []; throw failure; }
  }
  else {
    // Resolve the family against the explicitly selected legacy taxonomy; no hard-coded taxon key.
    const families = await getJson("/v1/species/search", { q: "Phoridae", rank: "FAMILY", datasetKey: BACKBONE, limit: "20" });
    const matches = Array.isArray(families.results) ? families.results.filter((row) => row.rank === "FAMILY" && row.canonicalName === "Phoridae" && row.taxonomicStatus === "ACCEPTED" && numericKey(row.key)) : null;
    if (!matches || matches.length !== 1) throw error(502, "GBIF could not resolve Phoridae for specimen search");
    const data = await getJson("/v1/occurrence/search", { q, familyKey: String(matches[0].key), limit: "100" });
    if (!Array.isArray(data.results)) throw error(502, "GBIF returned an unexpected search response");
    rows = data.results;
  }
  const terms = q.toLowerCase().split(/\s+/).slice(0, 8);
  return rows.filter((row) => row.family === "Phoridae" && (!key || numericKey(row.key) === key))
    .map((row) => normalize(row, "live_gbif")).filter(Boolean)
    .filter((candidate) => key || terms.every((term) => [candidate.scientific_name, candidate.genus, candidate.specific_epithet,
      candidate.institution_code, candidate.collection_code, candidate.catalog_number, candidate.recorded_by,
      candidate.locality, candidate.country].some((field) => field?.toLowerCase().includes(term))))
    .sort((a, b) => Number(b.basis_of_record === "PRESERVED_SPECIMEN") - Number(a.basis_of_record === "PRESERVED_SPECIMEN"))
    .slice(0, 30);
}

async function resolveOccurrence(key) {
  let cached = [];
  try { cached = await searchCache(key, { exact: true }); } catch (failure) { if (failure.status !== 503) throw failure; }
  const candidate = cached[0] || (await searchLive(key, { exact: true }))[0];
  if (!candidate) throw error(404, "No usable Phoridae specimen was found for this occurrence key");
  return candidate;
}

module.exports = { parseQuery, normalize, searchCache, searchLive, resolveOccurrence };
