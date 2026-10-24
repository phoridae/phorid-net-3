const serialize = (row) => ({ ...row, id: String(row.id),
  ...(row.character_id != null ? { character_id: String(row.character_id) } : {}) });

async function charactersWithStates(db, characters) {
  if (!characters.length) return [];
  const [states] = await db.query(`SELECT * FROM character_states
    WHERE character_id IN (${characters.map(() => "?").join(",")})
    ORDER BY display_order, name, id`, characters.map((character) => character.id));
  const byCharacter = new Map();
  for (const state of states) {
    const id = String(state.character_id);
    if (!byCharacter.has(id)) byCharacter.set(id, []);
    byCharacter.get(id).push(serialize(state));
  }
  return characters.map((character) => ({ ...serialize(character), states: byCharacter.get(String(character.id)) || [] }));
}

async function characterUsage(db, id) {
  const count = async (sql) => Number((await db.query(sql, [id]))[0][0].count);
  const [workspaceCount, specimenCount, descriptionCount, keyRows, stateRows] = await Promise.all([
    count("SELECT COUNT(*) AS count FROM workspace_characters WHERE character_id = ?"),
    count("SELECT COUNT(*) AS count FROM specimen_observations WHERE character_id = ?"),
    count("SELECT COUNT(*) AS count FROM character_observations WHERE character_id = ?"),
    db.query(`SELECT COUNT(*) AS count FROM (
      SELECT key_id FROM key_characters WHERE character_id = ?
      UNION SELECT kd.key_id FROM key_descriptions kd
      JOIN character_observations co ON co.description_id = kd.description_id WHERE co.character_id = ?
    ) used_keys`, [id, id]),
    db.query(`SELECT cs.id,
      (SELECT COUNT(*) FROM specimen_observation_states sos WHERE sos.state_id = cs.id) AS specimen_observation_count,
      (SELECT COUNT(*) FROM observation_states os WHERE os.state_id = cs.id) AS description_observation_count
      FROM character_states cs WHERE cs.character_id = ? ORDER BY cs.display_order, cs.name, cs.id`, [id]),
  ]);
  return {
    workspace_count: workspaceCount,
    specimen_observation_count: specimenCount,
    description_observation_count: descriptionCount,
    key_count: Number(keyRows[0][0].count),
    states: stateRows[0].map((state) => ({ id: String(state.id),
      specimen_observation_count: Number(state.specimen_observation_count),
      description_observation_count: Number(state.description_observation_count) })),
  };
}

module.exports = { charactersWithStates, characterUsage };
