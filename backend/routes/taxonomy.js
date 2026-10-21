const express = require("express");
const taxonomyPool = require("../dbTaxonomy");

const router = express.Router();

function serializeId(value) {
  return value === null || value === undefined ? null : String(value);
}

function serializeDecimal(value) {
  if (value === null || value === undefined) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function serializeWorkspace(row) {
  return {
    id: serializeId(row.id),
    name: row.name,
    description: row.description,
    owner_uid: row.owner_uid,
    visibility: row.visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findWorkspace(id) {
  const [rows] = await taxonomyPool.query(
    `
      SELECT
        id,
        name,
        description,
        owner_uid,
        visibility,
        created_at,
        updated_at
      FROM workspaces
      WHERE id = ?
    `,
    [id]
  );

  return rows[0] ? serializeWorkspace(rows[0]) : null;
}

router.param("id", (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({ error: "id must be a positive integer" });
  }

  next();
});

router.get("/workspaces", async (req, res, next) => {
  try {
    const [rows] = await taxonomyPool.query(`
      SELECT
        id,
        name,
        description,
        owner_uid,
        visibility,
        created_at,
        updated_at
      FROM workspaces
      ORDER BY name, id
    `);

    res.json(rows.map(serializeWorkspace));
  } catch (error) {
    next(error);
  }
});

router.get("/workspaces/:id", async (req, res, next) => {
  try {
    const workspace = await findWorkspace(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    res.json(workspace);
  } catch (error) {
    next(error);
  }
});

router.get("/workspaces/:id/species", async (req, res, next) => {
  try {
    const [workspace, [rows]] = await Promise.all([
      findWorkspace(req.params.id),
      taxonomyPool.query(
        `
          SELECT
            s.id,
            s.gbif_taxon_key,
            s.genus,
            s.specific_epithet,
            s.species_status,
            s.working_name,
            s.notes,
            s.created_at,
            s.updated_at,
            ws.display_order,
            ws.created_at AS workspace_species_created_at,
            sd.id AS description_id,
            sd.sex_scope AS description_sex_scope,
            sd.basis AS description_basis,
            sd.diagnosis AS description_diagnosis,
            sd.remarks AS description_remarks,
            sd.prepared_by_uid AS description_prepared_by_uid,
            sd.created_at AS description_created_at,
            sd.updated_at AS description_updated_at
          FROM workspace_species ws
          JOIN species s ON s.id = ws.species_id
          LEFT JOIN species_descriptions sd
            ON sd.workspace_id = ws.workspace_id
            AND sd.species_id = ws.species_id
          WHERE ws.workspace_id = ?
          ORDER BY
            ws.display_order,
            s.genus,
            s.specific_epithet,
            s.id,
            sd.sex_scope,
            sd.id
        `,
        [req.params.id]
      ),
    ]);

    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const speciesById = new Map();

    for (const row of rows) {
      const speciesId = serializeId(row.id);

      if (!speciesById.has(speciesId)) {
        speciesById.set(speciesId, {
          id: speciesId,
          gbif_taxon_key: serializeId(row.gbif_taxon_key),
          genus: row.genus,
          specific_epithet: row.specific_epithet,
          species_status: row.species_status,
          working_name: row.working_name,
          notes: row.notes,
          created_at: row.created_at,
          updated_at: row.updated_at,
          display_order: row.display_order,
          workspace_species_created_at: row.workspace_species_created_at,
          descriptions: [],
        });
      }

      if (row.description_id !== null) {
        speciesById.get(speciesId).descriptions.push({
          id: serializeId(row.description_id),
          sex_scope: row.description_sex_scope,
          basis: row.description_basis,
          diagnosis: row.description_diagnosis,
          remarks: row.description_remarks,
          prepared_by_uid: row.description_prepared_by_uid,
          created_at: row.description_created_at,
          updated_at: row.description_updated_at,
        });
      }
    }

    res.json([...speciesById.values()]);
  } catch (error) {
    next(error);
  }
});

router.get("/workspaces/:id/characters", async (req, res, next) => {
  try {
    const [workspace, [rows]] = await Promise.all([
      findWorkspace(req.params.id),
      taxonomyPool.query(
        `
          SELECT
            c.id,
            c.name,
            c.description,
            c.anatomical_region,
            c.data_type,
            c.unit,
            c.created_by_uid,
            c.visibility,
            c.created_at,
            c.updated_at,
            wc.display_order,
            wc.created_at AS workspace_character_created_at,
            cs.id AS state_id,
            cs.name AS state_name,
            cs.description AS state_description,
            cs.display_order AS state_display_order,
            cs.created_at AS state_created_at,
            cs.updated_at AS state_updated_at
          FROM workspace_characters wc
          JOIN characters c ON c.id = wc.character_id
          LEFT JOIN character_states cs ON cs.character_id = c.id
          WHERE wc.workspace_id = ?
          ORDER BY
            wc.display_order,
            c.name,
            c.id,
            cs.display_order,
            cs.name,
            cs.id
        `,
        [req.params.id]
      ),
    ]);

    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const charactersById = new Map();

    for (const row of rows) {
      const characterId = serializeId(row.id);

      if (!charactersById.has(characterId)) {
        charactersById.set(characterId, {
          id: characterId,
          name: row.name,
          description: row.description,
          anatomical_region: row.anatomical_region,
          data_type: row.data_type,
          unit: row.unit,
          created_by_uid: row.created_by_uid,
          visibility: row.visibility,
          created_at: row.created_at,
          updated_at: row.updated_at,
          display_order: row.display_order,
          workspace_character_created_at: row.workspace_character_created_at,
          states: [],
        });
      }

      if (row.state_id !== null) {
        charactersById.get(characterId).states.push({
          id: serializeId(row.state_id),
          name: row.state_name,
          description: row.state_description,
          display_order: row.state_display_order,
          created_at: row.state_created_at,
          updated_at: row.state_updated_at,
        });
      }
    }

    res.json([...charactersById.values()]);
  } catch (error) {
    next(error);
  }
});

router.get("/descriptions/:id", async (req, res, next) => {
  try {
    const [descriptionRows] = await taxonomyPool.query(
      `
        SELECT
          sd.id AS description_id,
          sd.sex_scope,
          sd.basis,
          sd.diagnosis,
          sd.remarks,
          sd.prepared_by_uid,
          sd.created_at AS description_created_at,
          sd.updated_at AS description_updated_at,
          w.id AS workspace_id,
          w.name AS workspace_name,
          w.description AS workspace_description,
          w.owner_uid AS workspace_owner_uid,
          w.visibility AS workspace_visibility,
          w.created_at AS workspace_created_at,
          w.updated_at AS workspace_updated_at,
          s.id AS species_id,
          s.gbif_taxon_key,
          s.genus,
          s.specific_epithet,
          s.species_status,
          s.working_name,
          s.notes AS species_notes,
          s.created_at AS species_created_at,
          s.updated_at AS species_updated_at
        FROM species_descriptions sd
        JOIN workspaces w ON w.id = sd.workspace_id
        JOIN species s ON s.id = sd.species_id
        WHERE sd.id = ?
      `,
      [req.params.id]
    );

    const row = descriptionRows[0];

    if (!row) {
      return res.status(404).json({ error: "Description not found" });
    }

    const [[publicationRows], [specimenRows], [observationRows]] =
      await Promise.all([
        taxonomyPool.query(
          `
            SELECT
              p.id,
              p.short_label,
              p.citation,
              p.doi,
              p.url,
              p.notes,
              p.created_at,
              p.updated_at,
              dp.notes AS association_notes,
              dp.created_at AS association_created_at
            FROM description_publications dp
            JOIN publications p ON p.id = dp.publication_id
            WHERE dp.description_id = ?
            ORDER BY p.short_label, p.id
          `,
          [req.params.id]
        ),
        taxonomyPool.query(
          `
            SELECT
              sr.id,
              sr.reference_type,
              sr.gbif_occurrence_key,
              sr.publication_id,
              sr.institution_code,
              sr.catalog_number,
              sr.specimen_label,
              sr.notes,
              sr.created_at,
              sr.updated_at,
              ds.notes AS association_notes,
              ds.created_at AS association_created_at
            FROM description_specimens ds
            JOIN specimen_references sr ON sr.id = ds.specimen_reference_id
            WHERE ds.description_id = ?
            ORDER BY sr.institution_code, sr.catalog_number, sr.id
          `,
          [req.params.id]
        ),
        taxonomyPool.query(
          `
            SELECT
              co.id AS observation_id,
              co.numeric_min,
              co.numeric_max,
              co.notes AS observation_notes,
              co.created_at AS observation_created_at,
              co.updated_at AS observation_updated_at,
              c.id AS character_id,
              c.name AS character_name,
              c.description AS character_description,
              c.anatomical_region,
              c.data_type,
              c.unit,
              c.created_by_uid,
              c.visibility,
              c.created_at AS character_created_at,
              c.updated_at AS character_updated_at,
              cs.id AS state_id,
              cs.name AS state_name,
              cs.description AS state_description,
              cs.display_order AS state_display_order,
              cs.created_at AS state_created_at,
              cs.updated_at AS state_updated_at
            FROM character_observations co
            JOIN characters c ON c.id = co.character_id
            LEFT JOIN observation_states os
              ON os.observation_id = co.id
              AND os.character_id = co.character_id
            LEFT JOIN character_states cs
              ON cs.id = os.state_id
              AND cs.character_id = os.character_id
            WHERE co.description_id = ?
            ORDER BY
              c.anatomical_region,
              c.name,
              c.id,
              cs.display_order,
              cs.name,
              cs.id
          `,
          [req.params.id]
        ),
      ]);

    const observationsById = new Map();

    for (const observationRow of observationRows) {
      const observationId = serializeId(observationRow.observation_id);

      if (!observationsById.has(observationId)) {
        const min = serializeDecimal(observationRow.numeric_min);
        const max = serializeDecimal(observationRow.numeric_max);

        observationsById.set(observationId, {
          id: observationId,
          notes: observationRow.observation_notes,
          created_at: observationRow.observation_created_at,
          updated_at: observationRow.observation_updated_at,
          character: {
            id: serializeId(observationRow.character_id),
            name: observationRow.character_name,
            description: observationRow.character_description,
            anatomical_region: observationRow.anatomical_region,
            data_type: observationRow.data_type,
            unit: observationRow.unit,
            created_by_uid: observationRow.created_by_uid,
            visibility: observationRow.visibility,
            created_at: observationRow.character_created_at,
            updated_at: observationRow.character_updated_at,
          },
          numeric_range:
            min !== null || max !== null
              ? { min, max, unit: observationRow.unit }
              : null,
          states: [],
        });
      }

      if (observationRow.state_id !== null) {
        observationsById.get(observationId).states.push({
          id: serializeId(observationRow.state_id),
          name: observationRow.state_name,
          description: observationRow.state_description,
          display_order: observationRow.state_display_order,
          created_at: observationRow.state_created_at,
          updated_at: observationRow.state_updated_at,
        });
      }
    }

    res.json({
      id: serializeId(row.description_id),
      sex_scope: row.sex_scope,
      basis: row.basis,
      diagnosis: row.diagnosis,
      remarks: row.remarks,
      prepared_by_uid: row.prepared_by_uid,
      created_at: row.description_created_at,
      updated_at: row.description_updated_at,
      workspace: {
        id: serializeId(row.workspace_id),
        name: row.workspace_name,
        description: row.workspace_description,
        owner_uid: row.workspace_owner_uid,
        visibility: row.workspace_visibility,
        created_at: row.workspace_created_at,
        updated_at: row.workspace_updated_at,
      },
      species: {
        id: serializeId(row.species_id),
        gbif_taxon_key: serializeId(row.gbif_taxon_key),
        genus: row.genus,
        specific_epithet: row.specific_epithet,
        species_status: row.species_status,
        working_name: row.working_name,
        notes: row.species_notes,
        created_at: row.species_created_at,
        updated_at: row.species_updated_at,
      },
      publications: publicationRows.map((publication) => ({
        id: serializeId(publication.id),
        short_label: publication.short_label,
        citation: publication.citation,
        doi: publication.doi,
        url: publication.url,
        notes: publication.notes,
        created_at: publication.created_at,
        updated_at: publication.updated_at,
        association_notes: publication.association_notes,
        association_created_at: publication.association_created_at,
      })),
      specimen_references: specimenRows.map((specimen) => ({
        id: serializeId(specimen.id),
        reference_type: specimen.reference_type,
        gbif_occurrence_key: serializeId(specimen.gbif_occurrence_key),
        publication_id: serializeId(specimen.publication_id),
        institution_code: specimen.institution_code,
        catalog_number: specimen.catalog_number,
        specimen_label: specimen.specimen_label,
        notes: specimen.notes,
        created_at: specimen.created_at,
        updated_at: specimen.updated_at,
        association_notes: specimen.association_notes,
        association_created_at: specimen.association_created_at,
      })),
      character_observations: [...observationsById.values()],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
