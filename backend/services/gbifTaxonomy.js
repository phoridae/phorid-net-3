// Documented COL XR search, GBIF v2 resolution, and conservative legacy mapping.
// No curated identity depends on the research cache or a ChecklistBank row key.
const COL_XR = "7ddf754f-d193-4cc9-b351-99906754a03b";
const BACKBONE = "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c";
const error = (status, message) => Object.assign(new Error(message), { status });
const upper = (value) => String(value || "").toUpperCase();
const phoridae = (classification) => Array.isArray(classification) && classification.some((taxon) => upper(taxon.rank) === "FAMILY" && upper(taxon.name) === "PHORIDAE");

async function getJson(base, path, params) {
  const url = new URL(path, base);
  url.search = new URLSearchParams(params).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
    if (!response.ok) throw error(502, "GBIF / Catalogue of Life lookup is unavailable. Please try again.");
    const data = await response.json();
    if (!data || typeof data !== "object") throw error(502, "GBIF / Catalogue of Life returned an unexpected response.");
    return data;
  } catch (failure) {
    if (failure.status) throw failure;
    throw error(failure.name === "TimeoutError" ? 504 : 502, "GBIF / Catalogue of Life lookup failed. Please try again.");
  }
}

function normalizeSearch(row) {
  const usage = row?.usage;
  const name = usage?.name;
  if (!name || !usage.id || !phoridae(row.classification)) return null;
  const rank = upper(name.rank);
  const genus = name.genus || (rank === "GENUS" ? name.uninomial || name.scientificName : null);
  const accepted = row.accepted || usage.accepted;
  return {
    col_xr_taxon_key: String(usage.id), gbif_taxon_key: null,
    scientific_name: name.scientificName, canonical_name: name.scientificName,
    rank, taxonomic_status: upper(usage.status), family: "Phoridae",
    genus, specific_epithet: name.specificEpithet || null,
    accepted_name: accepted?.name?.scientificName || accepted?.label || null,
    accepted_col_xr_taxon_key: accepted?.id == null ? null : String(accepted.id),
    importable: rank === "SPECIES" && upper(usage.status) === "ACCEPTED" && !!genus && !!name.specificEpithet,
  };
}

async function search(q, rank = "SPECIES") {
  const data = await getJson("https://api.checklistbank.org", "/dataset/3LXR/nameusage/search", { q, rank: rank.toLowerCase(), limit: 30 });
  if (!Array.isArray(data.result)) throw error(502, "Catalogue of Life returned an unexpected search response.");
  return data.result.map(normalizeSearch).filter((taxon) => taxon && taxon.rank === rank);
}
const match = (params) => getJson("https://api.gbif.org", "/v2/species/match", params);
const exact = (result) => upper(result.diagnostics?.matchType) === "EXACT" && !result.synonym;

async function resolveSpecies(colId) {
  const result = await match({ checklistKey: COL_XR, scientificNameID: `col:${colId}` });
  const usage = result.usage;
  if (!usage || String(usage.key) !== colId || !exact(result) || !phoridae(result.classification) ||
      upper(usage.rank) !== "SPECIES" || upper(usage.status) !== "ACCEPTED" || !usage.genericName || !usage.specificEpithet) {
    throw error(400, "Select an accepted Phoridae species resolved exactly in COL XR. Synonyms and higher ranks cannot be imported here.");
  }
  let legacyKey = null;
  try {
    const legacy = await match({ checklistKey: BACKBONE, scientificName: usage.canonicalName || usage.name, rank: "SPECIES", family: "Phoridae" });
    const key = String(legacy.usage?.key || "");
    if (exact(legacy) && /^\d+$/.test(key) && upper(legacy.usage.rank) === "SPECIES" && phoridae(legacy.classification)) {
      const mapped = await match({ checklistKey: COL_XR, scientificNameID: `gbif:${key}` });
      if (exact(mapped) && String(mapped.usage?.key) === colId) legacyKey = key;
    }
  } catch {
    // Legacy mapping is optional; failure must not prevent a valid COL import.
  }
  return { genus: usage.genericName, specific_epithet: usage.specificEpithet,
    species_status: "published", col_xr_taxon_key: colId, gbif_taxon_key: legacyKey };
}

module.exports = { search, resolveSpecies, normalizeSearch, COL_XR, BACKBONE };
