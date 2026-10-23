const express = require("express");
const pool = require("../dbTaxonomy");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();
router.use(requireAdmin);

const id = (value) => value == null ? null : String(value);
const validId = (value) =>
  (typeof value === "string" || Number.isSafeInteger(value)) &&
  /^[1-9]\d*$/.test(String(value)) &&
  BigInt(value) <= 18446744073709551615n;

function serializeKey(row) {
  return { ...row, id: id(row.id), source_publication_id: id(row.source_publication_id) };
}

router.param("id", async (req, res, next, keyId) => {
  if (!validId(keyId)) {
    return res.status(400).json({ error: "id must be a positive unsigned BIGINT" });
  }
  try {
    const [rows] = await pool.query("SELECT * FROM identification_keys WHERE id = ?", [keyId]);
    if (!rows.length) return res.status(404).json({ error: "Key not found" });
    req.identificationKey = serializeKey(rows[0]);
    next();
  } catch (error) {
    next(error);
  }
});

async function getCharacters(keyId) {
  const [rows] = await pool.query(`
    SELECT c.*, kc.display_order, kc.notes AS key_character_notes,
      kc.created_at AS key_character_created_at,
      cs.id AS state_id, cs.name AS state_name,
      cs.description AS state_description, cs.display_order AS state_display_order,
      cs.created_at AS state_created_at, cs.updated_at AS state_updated_at
    FROM key_characters kc
    JOIN characters c ON c.id = kc.character_id
    LEFT JOIN character_states cs ON cs.character_id = c.id
    WHERE kc.key_id = ?
    ORDER BY kc.display_order, c.name, c.id, cs.display_order, cs.name, cs.id
  `, [keyId]);
  const characters = new Map();
  for (const row of rows) {
    const {
      state_id, state_name, state_description, state_display_order,
      state_created_at, state_updated_at, ...character
    } = row;
    const characterId = id(row.id);
    if (!characters.has(characterId)) {
      characters.set(characterId, { ...character, id: characterId, states: [] });
    }
    if (state_id != null) {
      characters.get(characterId).states.push({
        id: id(state_id), name: state_name, description: state_description,
        display_order: state_display_order, created_at: state_created_at,
        updated_at: state_updated_at,
      });
    }
  }
  return [...characters.values()];
}

// Each result is one selected description; observations from separate descriptions
// must never be combined to make a match.
async function getCandidates(key, conditions = [], params = []) {
  const [rows] = await pool.query(`
    SELECT sd.*, kd.notes AS key_description_notes,
      kd.created_at AS key_description_created_at,
      w.name AS workspace_name, s.gbif_taxon_key, s.col_xr_taxon_key, s.genus,
      s.specific_epithet, s.species_status, s.working_name
    FROM key_descriptions kd
    JOIN species_descriptions sd ON sd.id = kd.description_id
    JOIN workspaces w ON w.id = sd.workspace_id
    JOIN species s ON s.id = sd.species_id
    WHERE kd.key_id = ?
      AND (? = 'draft' OR s.species_status = 'published')
      ${conditions.map((condition) => `AND (${condition})`).join("\n")}
    ORDER BY s.genus, s.specific_epithet, s.working_name, s.id, sd.workspace_id, sd.sex_scope, sd.id
  `, [key.id, key.status, ...params]);
  return rows.map((row) => ({
    ...row, id: id(row.id), workspace_id: id(row.workspace_id),
    species_id: id(row.species_id), gbif_taxon_key: id(row.gbif_taxon_key),
    col_xr_taxon_key: id(row.col_xr_taxon_key),
  }));
}

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM identification_keys ORDER BY name, id");
    res.json(rows.map(serializeKey));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", (req, res) => res.json(req.identificationKey));

router.get("/:id/characters", async (req, res, next) => {
  try {
    res.json(await getCharacters(req.params.id));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/candidates", async (req, res, next) => {
  try {
    res.json(await getCandidates(req.identificationKey));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/filter", async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || Array.isArray(body) || typeof body !== "object" ||
        Object.keys(body).some((field) => field !== "filters") || !Array.isArray(body.filters)) {
      return res.status(400).json({ error: "Body must contain a filters array" });
    }
    const characters = new Map((await getCharacters(req.params.id)).map((c) => [c.id, c]));
    const seen = new Set();
    const conditions = [];
    const params = [];
    for (const filter of body.filters) {
      if (!filter || Array.isArray(filter) || typeof filter !== "object" || !validId(filter.character_id)) {
        return res.status(400).json({ error: "Each filter requires a valid character_id" });
      }
      const characterId = id(filter.character_id);
      const character = characters.get(characterId);
      if (!character || seen.has(characterId)) {
        return res.status(400).json({ error: "Characters must belong to this key and appear only once" });
      }
      seen.add(characterId);

      if (character.data_type === "categorical") {
        if (Object.keys(filter).some((field) => !["character_id", "state_ids"].includes(field)) ||
            !Array.isArray(filter.state_ids) || !filter.state_ids.length ||
            !filter.state_ids.every((value) => validId(value) && character.states.some((s) => s.id === id(value)))) {
          return res.status(400).json({ error: "Categorical filters require nonempty state_ids belonging to the character" });
        }
        const states = [...new Set(filter.state_ids.map(id))];
        // No recorded state means unknown, including an observation with no states.
        const scored = `SELECT 1 FROM character_observations co
          JOIN observation_states os ON os.observation_id = co.id AND os.character_id = co.character_id
          WHERE co.description_id = sd.id AND co.character_id = ?`;
        conditions.push(`NOT EXISTS (${scored}) OR EXISTS (${scored}
          AND os.state_id IN (${states.map(() => "?").join(", ")}))`);
        params.push(characterId, characterId, ...states);
      } else if (character.data_type === "numeric_range") {
        const { min, max } = filter;
        const finite = (value) => typeof value === "number" && Number.isFinite(value);
        if (Object.keys(filter).some((field) => !["character_id", "min", "max"].includes(field)) ||
            (min == null && max == null) ||
            (min != null && !finite(min)) || (max != null && !finite(max)) ||
            (min != null && max != null && min > max)) {
          return res.status(400).json({ error: "Numeric filters require finite min and/or max with min <= max" });
        }
        // Exclude only known disjoint ranges; null bounds remain unknown/open.
        const disjoint = [];
        params.push(characterId);
        if (min != null) { disjoint.push("co.numeric_max < ?"); params.push(min); }
        if (max != null) { disjoint.push("co.numeric_min > ?"); params.push(max); }
        conditions.push(`NOT EXISTS (SELECT 1 FROM character_observations co
          WHERE co.description_id = sd.id AND co.character_id = ?
          AND (${disjoint.join(" OR ")}))`);
      } else {
        return res.status(400).json({ error: "Unsupported character data type" });
      }
    }
    res.json(await getCandidates(req.identificationKey, conditions, params));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
