// Explicit provenance reads only. Evidence links never generate synthesized scores.
const id = (value) => value == null ? null : String(value);
function serialize(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value != null && (key === "id" || key.endsWith("_id") || key.endsWith("_key")) ? String(value) : value,
  ]));
}
async function rows(db, sql, params = []) { return (await db.query(sql, params))[0]; }
async function selectIds(db, table, ids) {
  if (!ids.length) return [];
  return rows(db, `SELECT * FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ids);
}
const indexed = (values) => new Map(values.map((row) => [id(row.id), serialize(row)]));

async function withSpecimenSpecies(db, specimens) {
  const species = indexed(await selectIds(db, "species", [...new Set(specimens.map((row) => id(row.species_id)).filter(Boolean))]));
  return specimens.map((row) => ({
    ...serialize(row), species_id: id(row.species_id),
    species: species.get(id(row.species_id)) || null,
  }));
}

async function specimenObservations(db, ids) {
  if (!ids.length) return [];
  const observations = await selectIds(db, "specimen_observations", ids);
  if (!observations.length) return [];
  const placeholders = observations.map(() => "?").join(",");
  const [specimens, characters, publications, states] = await Promise.all([
    selectIds(db, "specimen_references", [...new Set(observations.map((row) => id(row.specimen_reference_id)))]),
    selectIds(db, "characters", [...new Set(observations.map((row) => id(row.character_id)))]),
    selectIds(db, "publications", [...new Set(observations.map((row) => id(row.source_publication_id)).filter(Boolean))]),
    rows(db, `SELECT cs.*, sos.specimen_observation_id FROM specimen_observation_states sos
      JOIN character_states cs ON cs.id = sos.state_id AND cs.character_id = sos.character_id
      WHERE sos.specimen_observation_id IN (${placeholders}) ORDER BY cs.display_order, cs.name, cs.id`, observations.map((row) => id(row.id))),
  ]);
  const specimenMap = indexed(await withSpecimenSpecies(db, specimens)), characterMap = indexed(characters), publicationMap = indexed(publications);
  const statesByObservation = new Map();
  for (const { specimen_observation_id, ...state } of states) {
    const key = id(specimen_observation_id);
    if (!statesByObservation.has(key)) statesByObservation.set(key, []);
    statesByObservation.get(key).push(serialize(state));
  }
  return observations.map((row) => {
    const character = characterMap.get(id(row.character_id));
    const min = row.numeric_min == null ? null : Number(row.numeric_min);
    const max = row.numeric_max == null ? null : Number(row.numeric_max);
    return {
      ...serialize(row), numeric_min: min, numeric_max: max,
      numeric_range: min != null || max != null ? { min, max, unit: character.unit } : null,
      specimen_reference: specimenMap.get(id(row.specimen_reference_id)), character,
      source_publication: publicationMap.get(id(row.source_publication_id)) || null,
      states: statesByObservation.get(id(row.id)) || [],
    };
  });
}

async function descriptionProvenance(db, descriptionId) {
  const [reporting, publicationEvidence, specimenEvidence] = await Promise.all([
    rows(db, `SELECT p.*, dsp.specimen_reference_id, dsp.notes AS association_notes,
      dsp.created_at AS association_created_at FROM description_specimen_publications dsp
      JOIN publications p ON p.id = dsp.publication_id WHERE dsp.description_id = ? ORDER BY p.short_label, p.id`, [descriptionId]),
    rows(db, `SELECT p.*, cop.character_observation_id, cop.notes AS association_notes,
      cop.created_at AS association_created_at FROM character_observation_publications cop
      JOIN character_observations co ON co.id = cop.character_observation_id
      JOIN publications p ON p.id = cop.publication_id WHERE co.description_id = ? ORDER BY p.short_label, p.id`, [descriptionId]),
    rows(db, "SELECT * FROM character_observation_specimen_evidence WHERE description_id = ? ORDER BY specimen_observation_id", [descriptionId]),
  ]);
  const assertions = indexed(await specimenObservations(db, [...new Set(specimenEvidence.map((row) => id(row.specimen_observation_id)))]));
  const materialPublications = new Map(), observationPublications = new Map(), observationSpecimens = new Map();
  function add(map, key, value) {
    if (!map.has(id(key))) map.set(id(key), []);
    map.get(id(key)).push(value);
  }
  for (const { specimen_reference_id, ...publication } of reporting) add(materialPublications, specimen_reference_id, serialize(publication));
  for (const { character_observation_id, ...publication } of publicationEvidence) add(observationPublications, character_observation_id, serialize(publication));
  for (const link of specimenEvidence) {
    add(observationSpecimens, link.character_observation_id, {
      ...assertions.get(id(link.specimen_observation_id)),
      association_notes: link.notes, association_created_at: link.created_at,
    });
  }
  return { materialPublications, observationPublications, observationSpecimens };
}

module.exports = { specimenObservations, descriptionProvenance, withSpecimenSpecies };
