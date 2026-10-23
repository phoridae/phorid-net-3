const express = require("express");
const pool = require("../dbTaxonomy");
const requireAdmin = require("../middleware/requireAdmin");
const { specimenObservations, withSpecimenSpecies } = require("../services/taxonomyProvenance");
const gbifTaxonomy = require("../services/gbifTaxonomy");

const router = express.Router();
router.use(requireAdmin);

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function validId(value) {
  return (typeof value === "string" || Number.isSafeInteger(value)) &&
    /^[1-9]\d{0,19}$/.test(String(value)) && BigInt(value) <= 18446744073709551615n;
}
function identifier(value) {
  if (!validId(value)) fail(400, "IDs must be positive unsigned BIGINTs; use strings for large IDs");
  return String(value);
}
for (const name of ["id", "speciesId", "characterId", "stateId", "specimenId", "publicationId", "descriptionId"]) {
  router.param(name, (req, res, next, value) => {
    try { identifier(value); next(); } catch (error) { res.status(error.status).json({ error: error.message }); }
  });
}

const text = (limit, nullable = true) => (value) => {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || (!nullable && !value.trim()) ||
      [...value].length > limit || Buffer.byteLength(value, "utf8") > 65535) {
    fail(400, `Expected ${nullable ? "nullable " : "nonempty "}text of at most ${limit} characters`);
  }
  return value;
};
const choice = (values, nullable = false) => (value) => {
  if ((value === null && nullable) || values.includes(value)) return value;
  fail(400, `Expected one of: ${values.join(", ")}`);
};
const order = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > 4294967295) fail(400, "display_order must be an unsigned integer");
  return value;
};
const visibility = choice(["private", "shared", "public"]);
const workspaceFields = { name: text(255, false), description: text(65535), owner_uid: text(128), visibility };
const speciesFields = {
  col_xr_taxon_key: text(64),
  gbif_taxon_key: (v) => v === null ? null : identifier(v), genus: text(128, false),
  specific_epithet: text(128), species_status: choice(["published", "work_in_progress"]),
  working_name: text(255), notes: text(65535),
};
const characterFields = {
  name: text(255, false), description: text(65535), anatomical_region: text(128),
  data_type: choice(["categorical", "numeric_range"]), unit: text(64), visibility,
};
const descriptionFields = {
  workspace_id: identifier, species_id: identifier,
  sex_scope: choice(["general", "female", "male"]),
  basis: choice(["publication", "new_observations", "mixed"], true),
  interpretation_label: text(255),
  interpretation_type: choice(["published", "new_interpretation", "alternative", "synthesis"]),
  attribution_text: text(255),
  derived_from_description_id: (v) => v === null ? null : identifier(v),
  diagnosis: text(65535), remarks: text(65535), prepared_by_uid: text(128),
};

function body(req, fields, required = []) {
  const value = req.body;
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) fail(400, "A nonempty JSON object is required");
  const result = {};
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(fields, key)) fail(400, `Unsupported field: ${key}`);
    result[key] = fields[key](value[key]);
  }
  for (const key of required) if (!Object.hasOwn(result, key)) fail(400, `${key} is required`);
  return result;
}

function serialize(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value != null && (key === "id" || key.endsWith("_id") || key.endsWith("_key")) ? String(value) : value,
  ]));
}
async function rows(db, sql, params = []) { return (await db.query(sql, params))[0]; }
async function find(db, table, id) {
  const result = await rows(db, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
  if (!result.length) fail(404, `${table} record not found`);
  return result[0];
}
async function insert(db, table, values) {
  const fields = Object.keys(values);
  await db.query(`INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`, Object.values(values));
  // CAST avoids rounding mysql2's numeric insertId for BIGINT identifiers.
  const [row] = await rows(db, "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id");
  return serialize(await find(db, table, row.id));
}
async function update(db, table, id, values) {
  await db.query(`UPDATE ${table} SET ${Object.keys(values).map((key) => `${key} = ?`).join(", ")} WHERE id = ?`, [...Object.values(values), id]);
  return serialize(await find(db, table, id));
}
async function conflictIf(db, sql, params, message) {
  if ((await rows(db, sql, params)).length) fail(409, message);
}

// Commit before responding; every multi-table edit rolls back as a unit.
function mutation(handler, status = 200, deleteConflictMessage = "Cannot delete this resource while related records reference it") {
  return async (req, res, next) => {
    let db;
    try {
      db = await pool.getConnection();
      await db.beginTransaction();
      const result = await handler(req, db);
      await db.commit();
      if (status === 204) return res.status(204).end();
      res.status(status).json(result);
    } catch (error) {
      if (db) {
        try { await db.rollback(); } catch (rollbackError) { console.error("Taxonomy rollback failed:", rollbackError); }
      }
      if (error.status) return res.status(error.status).json({ error: error.message });
      if (["ER_ROW_IS_REFERENCED_2", "ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED", "ER_NO_REFERENCED_ROW"].includes(error.code)) {
        return res.status(409).json({ error: req.method === "DELETE"
          ? deleteConflictMessage : "Edit conflicts with an existing relationship" });
      }
      if (["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code)) {
        return res.status(409).json({ error: "Edit conflicts with existing data or a concurrent edit" });
      }
      next(error);
    } finally {
      if (db) db.release();
    }
  };
}

// Let the authoritative database constraints perform permitted cascades and
// reject restricted relationships. Never manually remove dependencies here.
for (const [resource, table, conflictMessage] of [
  ["workspaces", "workspaces", "Cannot delete workspace: its descriptions are referenced by an identification key"],
  ["species", "species", "Cannot delete species: its descriptions are referenced by an identification key"],
  ["characters", "characters", "Cannot delete character: it is referenced by observations or an identification key"],
  ["descriptions", "species_descriptions", "Cannot delete description: it is referenced by an identification key"],
]) {
  router.delete(`/${resource}/:id`, mutation(async (req, db) => {
    await find(db, table, req.params.id);
    if (resource === "species") {
      await conflictIf(db, "SELECT id FROM specimen_references WHERE species_id = ? LIMIT 1 FOR UPDATE", [req.params.id],
        "Cannot delete species: specimens are currently assigned to it; reassign or delete those specimen references first");
    }
    await db.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
  }, 204, conflictMessage));
}

router.post("/workspaces", mutation(async (req, db) => {
  const values = body(req, workspaceFields, ["name"]);
  return insert(db, "workspaces", { owner_uid: req.user.uid, ...values });
}, 201));
router.patch("/workspaces/:id", mutation(async (req, db) => {
  const values = body(req, workspaceFields);
  await find(db, "workspaces", req.params.id);
  return update(db, "workspaces", req.params.id, values);
}));

router.post("/species", mutation(async (req, db) => {
  const values = body(req, speciesFields, ["genus"]);
  const status = values.species_status || "published";
  if (status === "published" && !values.specific_epithet?.trim()) fail(400, "Published species require specific_epithet");
  if (status === "work_in_progress" && !values.specific_epithet?.trim() && !values.working_name?.trim()) fail(400, "Work-in-progress species without an epithet require working_name");
  return insert(db, "species", values);
}, 201));
router.post("/workspaces/:id/species/import", async (req, res, next) => {
  try {
    const values = body(req, { col_xr_taxon_key: text(64, false) }, ["col_xr_taxon_key"]);
    // Finish remote reads before taking database locks. Ignore client-supplied names/legacy IDs.
    req.importSpecies = await gbifTaxonomy.resolveSpecies(values.col_xr_taxon_key);
    next();
  } catch (failure) {
    if (failure.status) return res.status(failure.status).json({ error: failure.message });
    next(failure);
  }
}, mutation(async (req, db) => {
  await find(db, "workspaces", req.params.id);
  const values = body({ body: req.importSpecies }, speciesFields);
  async function matches() {
    return rows(db, "SELECT * FROM species WHERE col_xr_taxon_key = ? OR gbif_taxon_key = ? FOR UPDATE", [values.col_xr_taxon_key, values.gbif_taxon_key]);
  }
  let found = await matches();
  let created = false;
  if (!found.length) {
    try {
      found = [await insert(db, "species", values)];
      created = true;
    } catch (failure) {
      if (failure.code !== "ER_DUP_ENTRY") throw failure;
      found = await matches();
      if (!found.length) throw failure;
    }
  }
  if (found.length !== 1) fail(409, "External identifiers refer to different curated species; review those records before importing");
  let species = serialize(found[0]);
  if ((species.col_xr_taxon_key && species.col_xr_taxon_key !== values.col_xr_taxon_key) ||
      (species.gbif_taxon_key && values.gbif_taxon_key && species.gbif_taxon_key !== values.gbif_taxon_key)) {
    fail(409, "Existing species has conflicting external identifiers; review it before importing");
  }
  const identifiers = { col_xr_taxon_key: species.col_xr_taxon_key || values.col_xr_taxon_key,
    gbif_taxon_key: species.gbif_taxon_key || values.gbif_taxon_key };
  if (identifiers.col_xr_taxon_key !== species.col_xr_taxon_key || identifiers.gbif_taxon_key !== species.gbif_taxon_key) species = await update(db, "species", species.id, identifiers);
  const membership = await rows(db, "SELECT species_id FROM workspace_species WHERE workspace_id = ? AND species_id = ? FOR UPDATE", [req.params.id, species.id]);
  if (!membership.length) await db.query("INSERT INTO workspace_species (workspace_id, species_id) VALUES (?, ?)", [req.params.id, species.id]);
  return { species, workspace_id: req.params.id, created, already_in_workspace: membership.length > 0 };
}));
router.post("/workspaces/:id/species", mutation(async (req, db) => {
  const values = body(req, { species_id: identifier, display_order: order }, ["species_id"]);
  await find(db, "workspaces", req.params.id);
  await find(db, "species", values.species_id);
  await db.query("INSERT INTO workspace_species (workspace_id, species_id, display_order) VALUES (?, ?, ?)",
    [req.params.id, values.species_id, values.display_order ?? 0]);
  return { workspace_id: req.params.id, ...values, display_order: values.display_order ?? 0 };
}, 201));
router.delete("/workspaces/:id/species/:speciesId", mutation(async (req, db) => {
  await find(db, "workspaces", req.params.id);
  const params = [req.params.id, req.params.speciesId];
  if (!(await rows(db, "SELECT species_id FROM workspace_species WHERE workspace_id = ? AND species_id = ? FOR UPDATE", params)).length) fail(404, "Species membership not found");
  await conflictIf(db, `SELECT kd.description_id FROM key_descriptions kd
    JOIN species_descriptions sd ON sd.id = kd.description_id
    WHERE sd.workspace_id = ? AND sd.species_id = ?`, params, "Descriptions are used by an identification key");
  await db.query("DELETE FROM workspace_species WHERE workspace_id = ? AND species_id = ?", params);
}, 204));

router.post("/characters", mutation(async (req, db) => {
  const values = body(req, characterFields, ["name"]);
  if ((values.data_type || "categorical") === "categorical" && values.unit != null) fail(400, "Categorical characters cannot have units");
  return insert(db, "characters", { ...values, created_by_uid: req.user.uid });
}, 201));
router.patch("/characters/:id", mutation(async (req, db) => {
  const values = body(req, characterFields);
  const character = await find(db, "characters", req.params.id);
  const type = values.data_type || character.data_type;
  if (type === "categorical" && (Object.hasOwn(values, "unit") ? values.unit : character.unit) != null) fail(400, "Categorical characters cannot have units");
  if (type !== character.data_type) {
    await conflictIf(db, "SELECT id FROM specimen_observations WHERE character_id = ? LIMIT 1", [req.params.id], "Cannot change type of a specimen-observed character");
    await conflictIf(db, "SELECT id FROM character_observations WHERE character_id = ? LIMIT 1", [req.params.id], "Cannot change type of an observed character");
    await conflictIf(db, "SELECT id FROM character_states WHERE character_id = ? LIMIT 1", [req.params.id], "Remove character states before changing data_type");
  }
  if (Object.hasOwn(values, "unit") && values.unit !== character.unit) {
    await conflictIf(db, "SELECT id FROM specimen_observations WHERE character_id = ? LIMIT 1", [req.params.id], "Cannot change units of a specimen-observed character");
    await conflictIf(db, "SELECT id FROM character_observations WHERE character_id = ? LIMIT 1", [req.params.id], "Cannot change units of an observed character");
  }
  return update(db, "characters", req.params.id, values);
}));
router.post("/characters/:id/states", mutation(async (req, db) => {
  const values = body(req, { name: text(255, false), description: text(65535), display_order: order }, ["name"]);
  const character = await find(db, "characters", req.params.id);
  if (character.data_type !== "categorical") fail(400, "Only categorical characters have states");
  return insert(db, "character_states", { character_id: req.params.id, ...values });
}, 201));
router.delete("/characters/:id/states/:stateId", mutation(async (req, db) => {
  await find(db, "characters", req.params.id);
  const state = await find(db, "character_states", req.params.stateId);
  if (String(state.character_id) !== req.params.id) fail(404, "State not found for character");
  await conflictIf(db, "SELECT observation_id FROM observation_states WHERE state_id = ? LIMIT 1", [req.params.stateId], "State is used by observations");
  await conflictIf(db, "SELECT specimen_observation_id FROM specimen_observation_states WHERE state_id = ? LIMIT 1", [req.params.stateId], "State is used by specimen observations");
  await db.query("DELETE FROM character_states WHERE id = ?", [req.params.stateId]);
}, 204));

router.post("/workspaces/:id/characters", mutation(async (req, db) => {
  const values = body(req, { character_id: identifier, display_order: order }, ["character_id"]);
  await find(db, "workspaces", req.params.id);
  await find(db, "characters", values.character_id);
  await db.query("INSERT INTO workspace_characters (workspace_id, character_id, display_order) VALUES (?, ?, ?)",
    [req.params.id, values.character_id, values.display_order ?? 0]);
  return { workspace_id: req.params.id, ...values, display_order: values.display_order ?? 0 };
}, 201));
router.delete("/workspaces/:id/characters/:characterId", mutation(async (req, db) => {
  await find(db, "workspaces", req.params.id);
  if (!(await rows(db, "SELECT character_id FROM workspace_characters WHERE workspace_id = ? AND character_id = ? FOR UPDATE", [req.params.id, req.params.characterId])).length) fail(404, "Character membership not found");
  await conflictIf(db, `SELECT co.id FROM character_observations co
    JOIN species_descriptions sd ON sd.id = co.description_id
    WHERE sd.workspace_id = ? AND co.character_id = ? LIMIT 1`, [req.params.id, req.params.characterId], "Workspace character has observations");
  await db.query("DELETE FROM workspace_characters WHERE workspace_id = ? AND character_id = ?", [req.params.id, req.params.characterId]);
}, 204));
router.patch("/workspaces/:id/characters", mutation(async (req, db) => {
  const values = body(req, { character_ids: (value) => {
    if (!Array.isArray(value)) fail(400, "character_ids must be an array");
    const ids = value.map(identifier);
    if (new Set(ids).size !== ids.length) fail(400, "character_ids must be unique");
    return ids;
  } }, ["character_ids"]);
  await find(db, "workspaces", req.params.id);
  const current = await rows(db, "SELECT character_id FROM workspace_characters WHERE workspace_id = ? FOR UPDATE", [req.params.id]);
  const existing = new Set(current.map((row) => String(row.character_id)));
  if (existing.size !== values.character_ids.length || values.character_ids.some((id) => !existing.has(id))) fail(400, "character_ids must contain every workspace character exactly once");
  for (const [index, characterId] of values.character_ids.entries()) {
    await db.query("UPDATE workspace_characters SET display_order = ? WHERE workspace_id = ? AND character_id = ?", [index, req.params.id, characterId]);
  }
  return { workspace_id: req.params.id, character_ids: values.character_ids };
}));

async function validateDescription(db, values) {
  await find(db, "workspaces", values.workspace_id);
  if (!(await rows(db, "SELECT species_id FROM workspace_species WHERE workspace_id = ? AND species_id = ? FOR UPDATE", [values.workspace_id, values.species_id])).length) fail(404, "Species is not a member of this workspace");
  if (values.derived_from_description_id != null) {
    const [source] = await rows(db, "SELECT species_id FROM species_descriptions WHERE id = ? FOR UPDATE", [values.derived_from_description_id]);
    if (!source || String(source.species_id) !== String(values.species_id)) fail(400, "derived_from_description_id must reference an existing description of the same species");
  }
}
router.post("/descriptions", mutation(async (req, db) => {
  const values = body(req, descriptionFields, ["workspace_id", "species_id"]);
  await validateDescription(db, values);
  return insert(db, "species_descriptions", { prepared_by_uid: req.user.uid, ...values });
}, 201));
router.patch("/descriptions/:id", mutation(async (req, db) => {
  const values = body(req, descriptionFields);
  const current = await find(db, "species_descriptions", req.params.id);
  const combined = { ...current, ...values };
  await validateDescription(db, combined);
  if (String(combined.species_id) !== String(current.species_id)) {
    await conflictIf(db, "SELECT id FROM species_descriptions WHERE derived_from_description_id = ? AND species_id <> ? LIMIT 1", [req.params.id, combined.species_id], "Other interpretations derive from this description for a different species");
  }
  if (String(combined.workspace_id) !== String(current.workspace_id)) {
    await conflictIf(db, `SELECT co.id FROM character_observations co WHERE co.description_id = ?
      AND NOT EXISTS (SELECT 1 FROM workspace_characters wc WHERE wc.workspace_id = ? AND wc.character_id = co.character_id) LIMIT 1`,
    [req.params.id, combined.workspace_id], "Destination workspace is missing observed characters");
  }
  return update(db, "species_descriptions", req.params.id, values);
}));

const numericBound = (value) => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 999999.999999 || Number(value.toFixed(6)) !== value) fail(400, "Numeric bounds must fit DECIMAL(12,6)");
  return value;
};
async function observationContext(db, descriptionId, characterId, requireMembership) {
  // Acquire the workspace lock before description/character locks, matching
  // membership edits so removal cannot race with a new observation.
  const [description] = await rows(db, "SELECT workspace_id FROM species_descriptions WHERE id = ?", [descriptionId]);
  if (!description) fail(404, "Description not found");
  await find(db, "workspaces", description.workspace_id);
  const current = await find(db, "species_descriptions", descriptionId);
  const character = await find(db, "characters", characterId);
  if (requireMembership && !(await rows(db, "SELECT character_id FROM workspace_characters WHERE workspace_id = ? AND character_id = ? FOR UPDATE", [current.workspace_id, characterId])).length) fail(400, "Character is not part of the description's workspace");
  return character;
}
router.put("/descriptions/:id/observations/:characterId", mutation(async (req, db) => {
  const values = body(req, {
    state_ids: (value) => {
      if (!Array.isArray(value)) fail(400, "state_ids must be an array");
      return [...new Set(value.map(identifier))];
    },
    numeric_min: numericBound, numeric_max: numericBound, notes: text(65535),
    evidence_basis: choice(["unspecified", "specimen", "publication", "mixed", "taxonomic_judgment"]),
  });
  const character = await observationContext(db, req.params.id, req.params.characterId, true);
  if (character.data_type === "categorical") {
    if (!Object.hasOwn(values, "state_ids") || Object.hasOwn(values, "numeric_min") || Object.hasOwn(values, "numeric_max")) fail(400, "Categorical observations require state_ids and cannot contain numeric bounds");
    for (const stateId of values.state_ids) {
      const state = await find(db, "character_states", stateId);
      if (String(state.character_id) !== req.params.characterId) fail(400, "State does not belong to character");
    }
  } else {
    if (Object.hasOwn(values, "state_ids") || (!Object.hasOwn(values, "numeric_min") && !Object.hasOwn(values, "numeric_max"))) fail(400, "Numeric observations require numeric_min and/or numeric_max, without state_ids");
    if (values.numeric_min != null && values.numeric_max != null && values.numeric_min > values.numeric_max) fail(400, "numeric_min must be <= numeric_max");
  }
  const params = [req.params.id, req.params.characterId];
  const [existing] = await rows(db, "SELECT * FROM character_observations WHERE description_id = ? AND character_id = ? FOR UPDATE", params);
  const observationValues = { numeric_min: values.numeric_min ?? null, numeric_max: values.numeric_max ?? null, notes: values.notes ?? null,
    evidence_basis: values.evidence_basis ?? existing?.evidence_basis ?? "unspecified" };
  const observation = existing
    ? await update(db, "character_observations", existing.id, observationValues)
    : await insert(db, "character_observations", { description_id: req.params.id, character_id: req.params.characterId, ...observationValues });
  await db.query("DELETE FROM observation_states WHERE observation_id = ?", [observation.id]);
  for (const stateId of values.state_ids || []) {
    await db.query("INSERT INTO observation_states (observation_id, character_id, state_id) VALUES (?, ?, ?)", [observation.id, req.params.characterId, stateId]);
  }
  return { ...observation, numeric_min: observation.numeric_min == null ? null : Number(observation.numeric_min), numeric_max: observation.numeric_max == null ? null : Number(observation.numeric_max), state_ids: values.state_ids || [] };
}));
router.delete("/descriptions/:id/observations/:characterId", mutation(async (req, db) => {
  await observationContext(db, req.params.id, req.params.characterId, false);
  const result = await rows(db, "DELETE FROM character_observations WHERE description_id = ? AND character_id = ?", [req.params.id, req.params.characterId]);
  if (!result.affectedRows) fail(404, "Observation not found");
}, 204));

const nullableId = (value) => value === null ? null : identifier(value);
const boolean = (value) => {
  if (typeof value !== "boolean") fail(400, "Expected a JSON boolean");
  return value;
};
const idList = (value) => {
  if (!Array.isArray(value)) fail(400, "Expected an array of IDs");
  return [...new Set(value.map(identifier))];
};
const specimenFields = {
  species_id: identifier,
  reference_type: choice(["gbif", "local", "publication"]),
  gbif_occurrence_key: nullableId, publication_id: nullableId,
  institution_code: text(64), catalog_number: text(128), specimen_label: text(255), notes: text(65535),
};
async function validatePublication(db, publicationId) {
  if (publicationId != null) await find(db, "publications", publicationId);
}
router.post("/specimen-references", mutation(async (req, db) => {
  const values = body(req, specimenFields, ["reference_type", "species_id"]);
  await find(db, "species", values.species_id);
  await validatePublication(db, values.publication_id);
  return (await withSpecimenSpecies(db, [await insert(db, "specimen_references", values)]))[0];
}, 201));
router.get("/specimen-references/:id", async (req, res, next) => {
  try {
    const [specimen] = await rows(pool, "SELECT * FROM specimen_references WHERE id = ?", [req.params.id]);
    if (!specimen) return res.status(404).json({ error: "Specimen reference not found" });
    res.json((await withSpecimenSpecies(pool, [specimen]))[0]);
  } catch (error) { next(error); }
});
router.patch("/specimen-references/:id", mutation(async (req, db) => {
  const values = body(req, specimenFields);
  await find(db, "specimen_references", req.params.id);
  if (Object.hasOwn(values, "species_id")) await find(db, "species", values.species_id);
  await validatePublication(db, values.publication_id);
  return (await withSpecimenSpecies(db, [await update(db, "specimen_references", req.params.id, values)]))[0];
}));
router.delete("/specimen-references/:id", mutation(async (req, db) => {
  await find(db, "specimen_references", req.params.id);
  await db.query("DELETE FROM specimen_references WHERE id = ?", [req.params.id]);
}, 204, "Cannot delete specimen reference: it is linked to a description"));

const specimenLinkFields = { reported_material_examined: boolean, directly_examined: boolean, notes: text(65535) };
async function specimenLink(db, descriptionId, specimenId) {
  await find(db, "species_descriptions", descriptionId);
  const [link] = await rows(db, "SELECT * FROM description_specimens WHERE description_id = ? AND specimen_reference_id = ? FOR UPDATE", [descriptionId, specimenId]);
  if (!link) fail(404, "Description specimen association not found");
  return link;
}
function serializeSpecimenLink(link) {
  return { ...serialize(link), reported_material_examined: Boolean(link.reported_material_examined), directly_examined: Boolean(link.directly_examined) };
}
router.post("/descriptions/:id/specimens", mutation(async (req, db) => {
  const values = body(req, { specimen_reference_id: identifier, ...specimenLinkFields }, ["specimen_reference_id"]);
  await find(db, "species_descriptions", req.params.id);
  await find(db, "specimen_references", values.specimen_reference_id);
  await db.query(`INSERT INTO description_specimens
    (description_id, specimen_reference_id, reported_material_examined, directly_examined, notes) VALUES (?, ?, ?, ?, ?)`,
  [req.params.id, values.specimen_reference_id, values.reported_material_examined ?? false, values.directly_examined ?? false, values.notes ?? null]);
  return serializeSpecimenLink(await specimenLink(db, req.params.id, values.specimen_reference_id));
}, 201));
router.patch("/descriptions/:id/specimens/:specimenId", mutation(async (req, db) => {
  const values = body(req, specimenLinkFields);
  await specimenLink(db, req.params.id, req.params.specimenId);
  await db.query(`UPDATE description_specimens SET ${Object.keys(values).map((key) => `${key} = ?`).join(", ")}
    WHERE description_id = ? AND specimen_reference_id = ?`, [...Object.values(values), req.params.id, req.params.specimenId]);
  return serializeSpecimenLink(await specimenLink(db, req.params.id, req.params.specimenId));
}));
router.delete("/descriptions/:id/specimens/:specimenId", mutation(async (req, db) => {
  await specimenLink(db, req.params.id, req.params.specimenId);
  await db.query("DELETE FROM description_specimens WHERE description_id = ? AND specimen_reference_id = ?", [req.params.id, req.params.specimenId]);
}, 204));
router.post("/descriptions/:id/specimens/:specimenId/publications", mutation(async (req, db) => {
  const values = body(req, { publication_id: identifier }, ["publication_id"]);
  await specimenLink(db, req.params.id, req.params.specimenId);
  await find(db, "publications", values.publication_id);
  await db.query("INSERT INTO description_specimen_publications (description_id, specimen_reference_id, publication_id) VALUES (?, ?, ?)",
    [req.params.id, req.params.specimenId, values.publication_id]);
  return { description_id: req.params.id, specimen_reference_id: req.params.specimenId, ...values };
}, 201));
router.delete("/descriptions/:id/specimens/:specimenId/publications/:publicationId", mutation(async (req, db) => {
  await specimenLink(db, req.params.id, req.params.specimenId);
  const result = await rows(db, "DELETE FROM description_specimen_publications WHERE description_id = ? AND specimen_reference_id = ? AND publication_id = ?", [req.params.id, req.params.specimenId, req.params.publicationId]);
  if (!result.affectedRows) fail(404, "Material-examined publication association not found");
}, 204));

// Explicit description-publication membership makes publication-evidence
// prerequisites manageable without silently creating associations.
router.post("/descriptions/:id/publications", mutation(async (req, db) => {
  const values = body(req, { publication_id: identifier, notes: text(65535) }, ["publication_id"]);
  await find(db, "species_descriptions", req.params.id);
  await find(db, "publications", values.publication_id);
  await db.query("INSERT INTO description_publications (description_id, publication_id, notes) VALUES (?, ?, ?)", [req.params.id, values.publication_id, values.notes ?? null]);
  return { description_id: req.params.id, ...values };
}, 201));
router.delete("/descriptions/:id/publications/:publicationId", mutation(async (req, db) => {
  await find(db, "species_descriptions", req.params.id);
  await conflictIf(db, `SELECT cop.character_observation_id FROM character_observation_publications cop
    JOIN character_observations co ON co.id = cop.character_observation_id
    WHERE co.description_id = ? AND cop.publication_id = ? LIMIT 1`, [req.params.id, req.params.publicationId], "Publication is used as synthesized observation evidence");
  const result = await rows(db, "DELETE FROM description_publications WHERE description_id = ? AND publication_id = ?", [req.params.id, req.params.publicationId]);
  if (!result.affectedRows) fail(404, "Description publication association not found");
}, 204));

const specimenObservationFields = {
  state_ids: idList, numeric_min: numericBound, numeric_max: numericBound,
  observation_basis: choice(["direct_exam", "publication", "other"]),
  observed_by_uid: text(128), attribution_text: text(255), source_publication_id: nullableId, notes: text(65535),
};
async function validateObservationValues(db, character, values, requireValues) {
  const states = Object.hasOwn(values, "state_ids");
  const numeric = Object.hasOwn(values, "numeric_min") || Object.hasOwn(values, "numeric_max");
  if (character.data_type === "categorical") {
    if (numeric || (requireValues && !states)) fail(400, "Categorical observations require state_ids and cannot contain numeric bounds");
    for (const stateId of values.state_ids || []) {
      const state = await find(db, "character_states", stateId);
      if (String(state.character_id) !== String(character.id)) fail(400, "State does not belong to character");
    }
  } else {
    if (states || (requireValues && !numeric)) fail(400, "Numeric observations require numeric bounds and cannot contain state_ids");
    if (values.numeric_min != null && values.numeric_max != null && values.numeric_min > values.numeric_max) fail(400, "numeric_min must be <= numeric_max");
  }
}
async function replaceSpecimenStates(db, observation, stateIds) {
  await db.query("DELETE FROM specimen_observation_states WHERE specimen_observation_id = ?", [observation.id]);
  for (const stateId of stateIds) {
    await db.query("INSERT INTO specimen_observation_states (specimen_observation_id, character_id, state_id) VALUES (?, ?, ?)", [observation.id, observation.character_id, stateId]);
  }
}
router.post("/specimen-references/:specimenId/observations", mutation(async (req, db) => {
  const { state_ids, ...values } = body(req, { character_id: identifier, ...specimenObservationFields }, ["character_id"]);
  await find(db, "specimen_references", req.params.specimenId);
  const character = await find(db, "characters", values.character_id);
  await validateObservationValues(db, character, { ...values, ...(state_ids !== undefined ? { state_ids } : {}) }, true);
  await validatePublication(db, values.source_publication_id);
  if ((values.observation_basis || "direct_exam") === "direct_exam" && !Object.hasOwn(values, "observed_by_uid")) values.observed_by_uid = req.user.uid;
  const observation = await insert(db, "specimen_observations", { ...values, specimen_reference_id: req.params.specimenId });
  if (state_ids !== undefined) await replaceSpecimenStates(db, observation, state_ids);
  return (await specimenObservations(db, [observation.id]))[0];
}, 201));
router.patch("/specimen-observations/:id", mutation(async (req, db) => {
  const { state_ids, ...values } = body(req, specimenObservationFields);
  const existing = await find(db, "specimen_observations", req.params.id);
  const character = await find(db, "characters", existing.character_id);
  await validateObservationValues(db, character, {
    ...(character.data_type === "numeric_range" ? { numeric_min: existing.numeric_min == null ? null : Number(existing.numeric_min), numeric_max: existing.numeric_max == null ? null : Number(existing.numeric_max) } : {}),
    ...values, ...(state_ids !== undefined ? { state_ids } : {}),
  }, false);
  await validatePublication(db, values.source_publication_id);
  if (values.observation_basis === "direct_exam" && existing.observation_basis !== "direct_exam" && !Object.hasOwn(values, "observed_by_uid")) values.observed_by_uid = req.user.uid;
  if (Object.keys(values).length) await update(db, "specimen_observations", req.params.id, values);
  if (state_ids !== undefined) await replaceSpecimenStates(db, existing, state_ids);
  return (await specimenObservations(db, [req.params.id]))[0];
}));
router.delete("/specimen-observations/:id", mutation(async (req, db) => {
  await find(db, "specimen_observations", req.params.id);
  await db.query("DELETE FROM specimen_observations WHERE id = ?", [req.params.id]);
}, 204));

async function synthesis(db, descriptionId, characterId) {
  await find(db, "species_descriptions", descriptionId);
  const [observation] = await rows(db, "SELECT * FROM character_observations WHERE description_id = ? AND character_id = ? FOR UPDATE", [descriptionId, characterId]);
  if (!observation) fail(404, "Description-level character observation not found");
  return observation;
}
router.put("/descriptions/:descriptionId/observations/:characterId/specimen-evidence", mutation(async (req, db) => {
  const values = body(req, { specimen_observation_ids: idList }, ["specimen_observation_ids"]);
  const observation = await synthesis(db, req.params.descriptionId, req.params.characterId);
  const evidence = [];
  for (const observationId of values.specimen_observation_ids) {
    const assertion = await find(db, "specimen_observations", observationId);
    if (String(assertion.character_id) !== req.params.characterId) fail(400, "Specimen observation concerns a different character");
    const [link] = await rows(db, "SELECT specimen_reference_id FROM description_specimens WHERE description_id = ? AND specimen_reference_id = ? FOR UPDATE", [req.params.descriptionId, assertion.specimen_reference_id]);
    if (!link) fail(400, "Specimen is not associated with this description");
    evidence.push(assertion);
  }
  await db.query("DELETE FROM character_observation_specimen_evidence WHERE character_observation_id = ?", [observation.id]);
  for (const assertion of evidence) {
    await db.query(`INSERT INTO character_observation_specimen_evidence
      (character_observation_id, description_id, specimen_reference_id, specimen_observation_id, character_id) VALUES (?, ?, ?, ?, ?)`,
    [observation.id, req.params.descriptionId, assertion.specimen_reference_id, assertion.id, req.params.characterId]);
  }
  return { character_observation_id: String(observation.id), ...values };
}));
router.put("/descriptions/:descriptionId/observations/:characterId/publication-evidence", mutation(async (req, db) => {
  const values = body(req, { publication_ids: idList }, ["publication_ids"]);
  const observation = await synthesis(db, req.params.descriptionId, req.params.characterId);
  for (const publicationId of values.publication_ids) {
    await find(db, "publications", publicationId);
    const [link] = await rows(db, "SELECT publication_id FROM description_publications WHERE description_id = ? AND publication_id = ? FOR UPDATE", [req.params.descriptionId, publicationId]);
    if (!link) fail(400, "Publication must already be associated with this description");
  }
  await db.query("DELETE FROM character_observation_publications WHERE character_observation_id = ?", [observation.id]);
  for (const publicationId of values.publication_ids) {
    await db.query("INSERT INTO character_observation_publications (character_observation_id, publication_id) VALUES (?, ?)", [observation.id, publicationId]);
  }
  return { character_observation_id: String(observation.id), ...values };
}));

module.exports = router;
