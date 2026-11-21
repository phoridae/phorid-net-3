const cache = require("../dbGbif");
const { withSpecimenSpecies } = require("./taxonomyProvenance");
const serializeSpecies = (species) => ({ ...species, id: String(species.id),
  gbif_taxon_key: species.gbif_taxon_key == null ? null : String(species.gbif_taxon_key),
  col_xr_taxon_key: species.col_xr_taxon_key == null ? null : String(species.col_xr_taxon_key) });

async function workspaceIdentifications(db, specimenIds, workspaceId) {
  let identifications = [];
  if (workspaceId && specimenIds.length) {
    [identifications] = await db.query(`SELECT * FROM workspace_specimen_identifications WHERE workspace_id = ? AND specimen_reference_id IN (${specimenIds.map(() => "?").join(",")})`, [workspaceId, ...specimenIds]);
    const ids = [...new Set(identifications.map((row) => String(row.species_id)))];
    const [species] = ids.length ? await db.query(`SELECT * FROM species WHERE id IN (${ids.map(() => "?").join(",")})`, ids) : [[]];
    identifications = identifications.map((row) => ({ ...row, workspace_id: String(row.workspace_id), specimen_reference_id: String(row.specimen_reference_id), species_id: String(row.species_id), species: serializeSpecies(species.find((species) => String(species.id) === String(row.species_id))) }));
  }
  return identifications;
}

async function withSpecimenSummary(db, specimens, workspaceId = null, { includeExternal = true } = {}) {
  const result = await withSpecimenSpecies(db, specimens.map((specimen) => ({ ...specimen, observation_count: Number(specimen.observation_count || 0) })));
  const identifications = await workspaceIdentifications(db, result.map((row) => row.id), workspaceId);
  let external = [];
  const keys = result.map((row) => row.gbif_occurrence_key).filter(Boolean);
  if (includeExternal && keys.length) {
    try {
      const [cached] = await cache.query(`SELECT CAST(gbifid AS CHAR) AS gbifid, scientific_name, accepted_scientific_name, species, CAST(species_key AS CHAR) AS species_key FROM gbif_occurrence_phoridae WHERE gbifid IN (${keys.map(() => "?").join(",")})`, keys);
      external = cached.map((row) => ({ ...row, source: "cache" }));
    } catch { /* A research cache outage must not hide curated voucher records. */ }
  }
  return result.map((row) => ({ ...row, workspace_identification: identifications.find((identification) => identification.specimen_reference_id === row.id) || null,
    external_taxonomy: external.find((taxon) => String(taxon.gbifid) === row.gbif_occurrence_key) || null }));
}

async function annotateCandidates(db, candidates, workspaceId = null) {
  if (!candidates.length) return [];
  const [existing] = await db.query(`SELECT id, gbif_occurrence_key FROM specimen_references
    WHERE gbif_occurrence_key IN (${candidates.map(() => "?").join(",")})`, candidates.map((candidate) => candidate.gbif_occurrence_key));
  const identifications = await workspaceIdentifications(db, existing.map((row) => String(row.id)), workspaceId);
  const clauses = [], params = [];
  for (const candidate of candidates) {
    if (candidate.col_xr_taxon_key) { clauses.push("col_xr_taxon_key = ?"); params.push(candidate.col_xr_taxon_key); }
    if (candidate.gbif_taxon_key) { clauses.push("gbif_taxon_key = ?"); params.push(candidate.gbif_taxon_key); }
    if (candidate.genus && candidate.specific_epithet) {
      clauses.push("(LOWER(genus) = LOWER(?) AND LOWER(specific_epithet) = LOWER(?) AND species_status = 'published')");
      params.push(candidate.genus, candidate.specific_epithet);
    }
  }
  const [species] = clauses.length ? await db.query(`SELECT * FROM species WHERE ${clauses.join(" OR ")}`, params) : [[]];
  return candidates.map((candidate) => {
    const byCol = candidate.col_xr_taxon_key && species.find((row) => String(row.col_xr_taxon_key) === candidate.col_xr_taxon_key);
    const byGbif = candidate.gbif_taxon_key && species.find((row) => String(row.gbif_taxon_key) === candidate.gbif_taxon_key);
    const byName = candidate.genus && candidate.specific_epithet ? species.filter((row) => row.species_status === "published" && row.genus.toLowerCase() === candidate.genus.toLowerCase() && row.specific_epithet?.toLowerCase() === candidate.specific_epithet.toLowerCase()) : [];
    const suggestion = byCol || byGbif || (byName.length === 1 ? byName[0] : null);
    const match = byCol ? "col_xr_taxon_key" : byGbif ? "gbif_taxon_key" : suggestion ? "scientific_name" : null;
    const specimen = existing.find((row) => String(row.gbif_occurrence_key) === candidate.gbif_occurrence_key);
    return { ...candidate, existing_specimen_id: specimen ? String(specimen.id) : null,
      workspace_identification: specimen ? identifications.find((row) => row.specimen_reference_id === String(specimen.id)) || null : null,
      species_suggestion: suggestion ? serializeSpecies(suggestion) : null, species_match: match };
  });
}

module.exports = { annotateCandidates, withSpecimenSummary };
