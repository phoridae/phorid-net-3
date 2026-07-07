const express = require("express");
const router = express.Router();

const gbifPool = require("../dbGbif");

function requireImportToken(req, res, next) {
  const expected = process.env.GBIF_IMPORT_TOKEN;

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "GBIF_IMPORT_TOKEN is not configured on the server.",
    });
  }

  const auth = req.headers.authorization || "";
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const queryToken = req.query.token;

  if (bearerToken !== expected && queryToken !== expected) {
    return res.status(403).json({
      ok: false,
      error: "Forbidden",
    });
  }

  next();
}

router.use(requireImportToken);

router.get("/health", async (req, res) => {
  try {
    const [rows] = await gbifPool.query(`
      SELECT
        DATABASE() AS database_name,
        NOW() AS server_time
    `);

    res.json({
      ok: true,
      mysql: rows[0],
    });
  } catch (error) {
    console.error("GBIF MySQL health check failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.post("/files/register", async (req, res) => {
  const { snapshot_date, files } = req.body;

  if (!snapshot_date || !Array.isArray(files)) {
    return res.status(400).json({
      ok: false,
      error: "Expected body: { snapshot_date, files: [{ file_key, file_uri }] }",
    });
  }

  if (files.length === 0) {
    return res.json({ ok: true, inserted_or_existing: 0 });
  }

  const values = files.map((file) => [
    snapshot_date,
    file.file_key,
    file.file_uri,
    "pending",
  ]);

  try {
    const [result] = await gbifPool.query(
      `
      INSERT INTO gbif_import_file (
        snapshot_date,
        file_key,
        file_uri,
        status
      )
      VALUES ?
      ON DUPLICATE KEY UPDATE
        file_uri = VALUES(file_uri)
      `,
      [values]
    );

    res.json({
      ok: true,
      affectedRows: result.affectedRows,
      fileCount: files.length,
    });
  } catch (error) {
    console.error("GBIF file register failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.get("/files/next", async (req, res) => {
  const snapshotDate = req.query.snapshot_date;
  const maxFiles = Math.min(Number(req.query.max_files || 25), 250);
  const maxAttempts = Number(req.query.max_attempts || 3);

  if (!snapshotDate) {
    return res.status(400).json({
      ok: false,
      error: "snapshot_date is required.",
    });
  }

  try {
    const [rows] = await gbifPool.query(
      `
      SELECT
        id,
        file_key,
        file_uri,
        status,
        attempt_count
      FROM gbif_import_file
      WHERE snapshot_date = ?
        AND status IN ('pending', 'failed')
        AND attempt_count < ?
      ORDER BY file_key
      LIMIT ?
      `,
      [snapshotDate, maxAttempts, maxFiles]
    );

    res.json({
      ok: true,
      files: rows,
    });
  } catch (error) {
    console.error("GBIF next files failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.post("/files/start", async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ ok: false, error: "id is required." });
  }

  try {
    await gbifPool.query(
      `
      UPDATE gbif_import_file
      SET
        status = 'running',
        attempt_count = attempt_count + 1,
        started_at = NOW(),
        finished_at = NULL,
        error_message = NULL
      WHERE id = ?
      `,
      [id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("GBIF file start failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.post("/files/complete", async (req, res) => {
  const { id, extracted_count } = req.body;

  if (!id) {
    return res.status(400).json({ ok: false, error: "id is required." });
  }

  try {
    await gbifPool.query(
      `
      UPDATE gbif_import_file
      SET
        status = 'complete',
        extracted_count = ?,
        finished_at = NOW(),
        error_message = NULL
      WHERE id = ?
      `,
      [extracted_count || 0, id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("GBIF file complete failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.post("/files/failed", async (req, res) => {
  const { id, error_message } = req.body;

  if (!id) {
    return res.status(400).json({ ok: false, error: "id is required." });
  }

  try {
    await gbifPool.query(
      `
      UPDATE gbif_import_file
      SET
        status = 'failed',
        finished_at = NOW(),
        error_message = ?
      WHERE id = ?
      `,
      [String(error_message || "Unknown error").slice(0, 65000), id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("GBIF file failed update failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code,
    });
  }
});

const occurrenceColumns = [
  "gbifid",
  "snapshot_date",
  "dataset_key",
  "publishing_org_key",
  "occurrence_id",
  "basis_of_record",
  "occurrence_status",
  "sex",
  "taxon_key",
  "species_key",
  "accepted_taxon_key",
  "kingdom",
  "phylum",
  "class_name",
  "order_name",
  "family",
  "genus",
  "species",
  "generic_name",
  "specific_epithet",
  "infraspecific_epithet",
  "taxon_rank",
  "taxonomic_status",
  "scientific_name",
  "scientific_name_authorship",
  "accepted_scientific_name",
  "decimal_latitude",
  "decimal_longitude",
  "coordinate_uncertainty_in_meters",
  "coordinate_precision",
  "geodetic_datum",
  "elevation",
  "elevation_accuracy",
  "verbatim_elevation",
  "continent",
  "country_code",
  "country",
  "state_province",
  "higher_geography",
  "locality",
  "verbatim_locality",
  "year",
  "month",
  "day",
  "event_date",
  "verbatim_event_date",
  "start_day_of_year",
  "end_day_of_year",
  "recorded_by",
  "identified_by",
  "sampling_protocol",
  "institution_code",
  "collection_code",
  "catalog_number",
  "owner_institution_code",
  "record_number",
  "type",
  "typestatus",
  "license",
  "access_rights",
  "language",
  "establishment_means",
  "last_interpreted",
  "gbif_region",
  "published_by_gbif_region",
  "is_in_cluster",
  "has_media",
  "media_type",
  "issue",
];

router.post("/occurrences/batch", async (req, res) => {
  const rows = req.body.rows;

  if (!Array.isArray(rows)) {
    return res.status(400).json({
      ok: false,
      error: "Expected body: { rows: [...] }",
    });
  }

  if (rows.length === 0) {
    return res.json({
      ok: true,
      inserted: 0,
    });
  }

  if (rows.length > 1000) {
    return res.status(400).json({
      ok: false,
      error: "Batch too large. Send 1000 rows or fewer.",
    });
  }

  const values = rows.map((row) =>
    occurrenceColumns.map((column) =>
      row[column] === undefined ? null : row[column]
    )
  );

  const updateColumns = occurrenceColumns.filter(
    (column) => column !== "gbifid"
  );

  const updateSql = updateColumns
    .map((column) => `${column} = VALUES(${column})`)
    .join(",\n        ");

  try {
    const [result] = await gbifPool.query(
      `
      INSERT INTO gbif_occurrence_phoridae (
        ${occurrenceColumns.join(", ")}
      )
      VALUES ?
      ON DUPLICATE KEY UPDATE
        ${updateSql}
      `,
      [values]
    );

    res.json({
      ok: true,
      received: rows.length,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("GBIF occurrence batch import failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.get("/status", async (req, res) => {
  const snapshotDate = req.query.snapshot_date;

  try {
    const params = [];
    let whereSql = "";

    if (snapshotDate) {
      whereSql = "WHERE snapshot_date = ?";
      params.push(snapshotDate);
    }

    const [fileStatusRows] = await gbifPool.query(
      `
      SELECT
        status,
        COUNT(*) AS file_count,
        COALESCE(SUM(extracted_count), 0) AS extracted_count
      FROM gbif_import_file
      ${whereSql}
      GROUP BY status
      ORDER BY status
      `,
      params
    );

    const [occurrenceCountRows] = await gbifPool.query(
      `
      SELECT COUNT(*) AS occurrence_count
      FROM gbif_occurrence_phoridae
      ${snapshotDate ? "WHERE snapshot_date = ?" : ""}
      `,
      snapshotDate ? [snapshotDate] : []
    );

    const [topGeneraRows] = await gbifPool.query(
      `
      SELECT
        genus,
        COUNT(*) AS occurrence_count
      FROM gbif_occurrence_phoridae
      ${snapshotDate ? "WHERE snapshot_date = ?" : ""}
      GROUP BY genus
      ORDER BY occurrence_count DESC
      LIMIT 20
      `,
      snapshotDate ? [snapshotDate] : []
    );

    res.json({
      ok: true,
      snapshot_date: snapshotDate || null,
      files: fileStatusRows,
      occurrences: occurrenceCountRows[0],
      top_genera: topGeneraRows,
    });
  } catch (error) {
    console.error("GBIF status failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code,
    });
  }
});

module.exports = router;