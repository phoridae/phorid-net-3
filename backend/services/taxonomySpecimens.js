const { withSpecimenSpecies } = require("./taxonomyProvenance");
const serializeSpecies = (species) => ({ ...species, id: String(species.id),
  gbif_taxon_key: species.gbif_taxon_key == null ? null : String(species.gbif_taxon_key),
  col_xr_taxon_key: species.col_xr_taxon_key == null ? null : String(species.col_xr_taxon_key) });

async function withSpecimenSummary(db, specimens) {
  return withSpecimenSpecies(db, specimens.map((specimen) => ({ ...specimen, observation_count: Number(specimen.observation_count || 0) })));
}

async function annotateCandidates(db, candidates) {
  if (!candidates.length) return [];
  const [existing] = await db.query(`SELECT id, gbif_occurrence_key FROM specimen_references
    WHERE gbif_occurrence_key IN (${candidates.map(() => "?").join(",")})`, candidates.map((candidate) => candidate.gbif_occurrence_key));
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
      species_suggestion: suggestion ? serializeSpecies(suggestion) : null, species_match: match };
  });
}

module.exports = { annotateCandidates, withSpecimenSummary };
