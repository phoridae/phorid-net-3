const express = require("express");
const pool = require("../dbTaxonomy");
const requireAdmin = require("../middleware/requireAdmin");

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
for (const name of ["id", "speciesId", "characterId", "stateId"]) {
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
  gbif_taxon_key: (v) => v === null ? null : identifier(v), genus: text(128, false),
  specific_epithet: text(128), species_status: choice(["published", "work_in_progress"]),
  working_name: text(255), notes: text(65535),
};
const characterFields = {
  name: text(255, false), description: text(65535), anatomical_region: text(128),
  data_type: choice(["categorical", "numeric_range"]), unit: text(64), visibility,
};
const descriptionFields = {
  sex_scope: choice(["general", "female", "male"]),
  basis: choice(["publication", "new_observations", "mixed"], true),
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
    value != null && (key === "id" || key.endsWith("_id") || key === "gbif_taxon_key") ? String(value) : value,
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
  if (status === "work_in_progress" && !values.working_name?.trim()) fail(400, "Work-in-progress species require working_name");
  return insert(db, "species", values);
}, 201));
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
    await conflictIf(db, "SELECT id FROM character_observations WHERE character_id = ? LIMIT 1", [req.params.id], "Cannot change type of an observed character");
    await conflictIf(db, "SELECT id FROM character_states WHERE character_id = ? LIMIT 1", [req.params.id], "Remove character states before changing data_type");
  }
  if (Object.hasOwn(values, "unit") && values.unit !== character.unit) {
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

router.post("/descriptions", mutation(async (req, db) => {
  const values = body(req, { workspace_id: identifier, species_id: identifier, ...descriptionFields }, ["workspace_id", "species_id"]);
  await find(db, "workspaces", values.workspace_id);
  if (!(await rows(db, "SELECT species_id FROM workspace_species WHERE workspace_id = ? AND species_id = ? FOR UPDATE", [values.workspace_id, values.species_id])).length) fail(404, "Species is not a member of this workspace");
  return insert(db, "species_descriptions", { prepared_by_uid: req.user.uid, ...values });
}, 201));
router.patch("/descriptions/:id", mutation(async (req, db) => {
  const values = body(req, descriptionFields);
  await find(db, "species_descriptions", req.params.id);
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
  const observationValues = { numeric_min: values.numeric_min ?? null, numeric_max: values.numeric_max ?? null, notes: values.notes ?? null };
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

module.exports = router;
