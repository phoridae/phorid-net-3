const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

require("dotenv").config();

const { XMLParser } = require("fast-xml-parser");
const { parse } = require("csv-parse/sync");

const execFileAsync = promisify(execFile);

function getArg(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function apiFetch(pathname, options = {}) {
  const baseUrl = requiredEnv("GBIF_IMPORT_API_BASE").replace(/\/$/, "");
  const token = requiredEnv("GBIF_IMPORT_TOKEN");

  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data.ok === false) {
    const detail = data.message || data.error || text || response.statusText;
    throw new Error(`API ${pathname} failed: ${response.status} ${detail}`);
  }

  return data;
}

async function listS3Keys({ bucket, prefix, region }) {
  const parser = new XMLParser();
  const keys = [];
  let continuationToken = null;

  while (true) {
    const params = new URLSearchParams({
      "list-type": "2",
      prefix,
      "max-keys": "1000",
    });

    if (continuationToken) {
      params.set("continuation-token", continuationToken);
    }

    const url = `https://s3.${region}.amazonaws.com/${bucket}?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`S3 list failed ${response.status}: ${await response.text()}`);
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);
    const result = parsed.ListBucketResult;

    let contents = result.Contents || [];
    if (!Array.isArray(contents)) contents = [contents];

    for (const item of contents) {
      if (!item.Key) continue;

      const key = item.Key;
      const baseName = key.split("/").pop();

      if (!baseName) continue;
      if (baseName.startsWith("_")) continue;
      if (key.endsWith("/")) continue;

      keys.push(key);
    }

    const isTruncated = String(result.IsTruncated).toLowerCase() === "true";
    if (!isTruncated) break;

    continuationToken = result.NextContinuationToken;
    if (!continuationToken) break;
  }

  return keys;
}

async function registerFiles({ snapshotDate, fileUris, registerLimit }) {
  const limitedUris = registerLimit ? fileUris.slice(0, registerLimit) : fileUris;

  const files = limitedUris.map((fileUri) => ({
    file_key: fileUri.split("/").pop(),
    file_uri: fileUri,
  }));

  const chunkSize = 500;

  let totalRegistered = 0;

  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);

    const result = await apiFetch("/files/register", {
      method: "POST",
      body: JSON.stringify({
        snapshot_date: snapshotDate,
        files: chunk,
      }),
    });

    totalRegistered += chunk.length;
    console.log(`Registered ${totalRegistered}/${files.length} file records`, result);
  }

  return files.length;
}

async function getNextFiles({ snapshotDate, maxFiles, maxAttempts }) {
  const params = new URLSearchParams({
    snapshot_date: snapshotDate,
    max_files: String(maxFiles),
    max_attempts: String(maxAttempts),
  });

  const result = await apiFetch(`/files/next?${params.toString()}`);
  return result.files || [];
}

async function markFileStart(id) {
  await apiFetch("/files/start", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

async function markFileComplete({ id, extractedCount }) {
  await apiFetch("/files/complete", {
    method: "POST",
    body: JSON.stringify({
      id,
      extracted_count: extractedCount,
    }),
  });
}

async function markFileFailed({ id, errorMessage }) {
  await apiFetch("/files/failed", {
    method: "POST",
    body: JSON.stringify({
      id,
      error_message: String(errorMessage || "Unknown error").slice(0, 65000),
    }),
  });
}

async function runDuckDbExtract({
  fileUri,
  outputCsv,
  family,
  snapshotDate,
  rowLimitPerFile,
}) {
  const limitClause = rowLimitPerFile ? `LIMIT ${Number(rowLimitPerFile)}` : "";

  const duckSql = `
INSTALL httpfs;
LOAD httpfs;

SET s3_region='us-east-1';
SET s3_endpoint='s3.us-east-1.amazonaws.com';
SET s3_url_style='path';

SET http_timeout = 900;
SET http_retries = 10;

COPY (
  SELECT
    CAST(gbifid AS VARCHAR) AS gbifid,
    CAST(DATE ${sqlLiteral(snapshotDate)} AS VARCHAR) AS snapshot_date,

    CAST(datasetkey AS VARCHAR) AS dataset_key,
    CAST(publishingorgkey AS VARCHAR) AS publishing_org_key,
    CAST(occurrenceid AS VARCHAR) AS occurrence_id,

    CAST(basisofrecord AS VARCHAR) AS basis_of_record,
    CAST(occurrencestatus AS VARCHAR) AS occurrence_status,
    CAST(NULL AS VARCHAR) AS sex,

    CAST(taxonkey AS VARCHAR) AS taxon_key,
    CAST(specieskey AS VARCHAR) AS species_key,
    CAST(NULL AS VARCHAR) AS accepted_taxon_key,

    CAST(kingdom AS VARCHAR) AS kingdom,
    CAST(phylum AS VARCHAR) AS phylum,
    CAST("class" AS VARCHAR) AS class_name,
    CAST("order" AS VARCHAR) AS order_name,
    CAST(family AS VARCHAR) AS family,
    CAST(genus AS VARCHAR) AS genus,
    CAST(species AS VARCHAR) AS species,

    CAST(genus AS VARCHAR) AS generic_name,
    NULLIF(split_part(CAST(species AS VARCHAR), ' ', 2), '') AS specific_epithet,
    CAST(infraspecificepithet AS VARCHAR) AS infraspecific_epithet,

    CAST(taxonrank AS VARCHAR) AS taxon_rank,
    CAST(NULL AS VARCHAR) AS taxonomic_status,

    CAST(scientificname AS VARCHAR) AS scientific_name,
    CAST(NULL AS VARCHAR) AS scientific_name_authorship,
    CAST(NULL AS VARCHAR) AS accepted_scientific_name,

    CAST(decimallatitude AS VARCHAR) AS decimal_latitude,
    CAST(decimallongitude AS VARCHAR) AS decimal_longitude,
    CAST(coordinateuncertaintyinmeters AS VARCHAR) AS coordinate_uncertainty_in_meters,
    CAST(coordinateprecision AS VARCHAR) AS coordinate_precision,
    CAST(NULL AS VARCHAR) AS geodetic_datum,

    CAST(elevation AS VARCHAR) AS elevation,
    CAST(elevationaccuracy AS VARCHAR) AS elevation_accuracy,
    CAST(NULL AS VARCHAR) AS verbatim_elevation,

    CAST(NULL AS VARCHAR) AS continent,
    CAST(countrycode AS VARCHAR) AS country_code,
    CAST(NULL AS VARCHAR) AS country,
    CAST(stateprovince AS VARCHAR) AS state_province,
    CAST(NULL AS VARCHAR) AS higher_geography,

    CAST(locality AS VARCHAR) AS locality,
    CAST(NULL AS VARCHAR) AS verbatim_locality,

    CAST("year" AS VARCHAR) AS year,
    CAST("month" AS VARCHAR) AS month,
    CAST("day" AS VARCHAR) AS day,
    CAST(eventdate AS VARCHAR) AS event_date,
    CAST(NULL AS VARCHAR) AS verbatim_event_date,
    CAST(NULL AS VARCHAR) AS start_day_of_year,
    CAST(NULL AS VARCHAR) AS end_day_of_year,

    CAST(recordedby AS VARCHAR) AS recorded_by,
    CAST(identifiedby AS VARCHAR) AS identified_by,
    CAST(NULL AS VARCHAR) AS sampling_protocol,

    CAST(institutioncode AS VARCHAR) AS institution_code,
    CAST(collectioncode AS VARCHAR) AS collection_code,
    CAST(catalognumber AS VARCHAR) AS catalog_number,
    CAST(NULL AS VARCHAR) AS owner_institution_code,
    CAST(recordnumber AS VARCHAR) AS record_number,

    CAST(NULL AS VARCHAR) AS type,
    CAST(typestatus AS VARCHAR) AS typestatus,

    CAST(license AS VARCHAR) AS license,
    CAST(NULL AS VARCHAR) AS access_rights,
    CAST(NULL AS VARCHAR) AS language,

    CAST(establishmentmeans AS VARCHAR) AS establishment_means,
    CAST(lastinterpreted AS VARCHAR) AS last_interpreted,

    CAST(NULL AS VARCHAR) AS gbif_region,
    CAST(NULL AS VARCHAR) AS published_by_gbif_region,

    CAST(NULL AS VARCHAR) AS is_in_cluster,
    CASE
      WHEN mediatype IS NULL THEN '0'
      ELSE '1'
    END AS has_media,
    CAST(mediatype AS VARCHAR) AS media_type,
    CAST(issue AS VARCHAR) AS issue

  FROM read_parquet(${sqlLiteral(fileUri)})
  WHERE family = ${sqlLiteral(family)}
  ${limitClause}
) TO ${sqlLiteral(outputCsv)}
WITH (FORMAT CSV, HEADER, DELIMITER ',', NULL '');
`;

  const sqlPath = `${outputCsv}.sql`;
  fs.writeFileSync(sqlPath, duckSql);

  const duckdbBin = process.env.DUCKDB_BIN || "duckdb";

  try {
    await execFileAsync(duckdbBin, ["-c", `.read ${sqlPath}`], {
      maxBuffer: 1024 * 1024 * 20,
    });
  } finally {
    if (fs.existsSync(sqlPath)) fs.unlinkSync(sqlPath);
  }
}

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  if (value === "") return null;
  return value;
}

function normalizeOccurrenceRow(row) {
  const normalized = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[key] = emptyToNull(value);
  }

  // MySQL TINYINT fields
  if (normalized.has_media === "true") normalized.has_media = 1;
  if (normalized.has_media === "false") normalized.has_media = 0;
  if (normalized.has_media !== null) normalized.has_media = Number(normalized.has_media);

  if (normalized.is_in_cluster === "true") normalized.is_in_cluster = 1;
  if (normalized.is_in_cluster === "false") normalized.is_in_cluster = 0;
  if (normalized.is_in_cluster !== null) normalized.is_in_cluster = Number(normalized.is_in_cluster);

  return normalized;
}

function readCsvRows(csvPath) {
  const csv = fs.readFileSync(csvPath, "utf8");

  if (!csv.trim()) return [];

  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
  });

  return rows.map(normalizeOccurrenceRow);
}

async function sendRowsInBatches(rows, batchSize) {
  let sent = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const result = await apiFetch("/occurrences/batch", {
      method: "POST",
      body: JSON.stringify({ rows: batch }),
    });

    sent += batch.length;

    console.log(
      `Sent ${sent}/${rows.length} rows`,
      `affectedRows=${result.affectedRows}`
    );
  }

  return sent;
}

async function processFile({
  file,
  snapshotDate,
  family,
  rowLimitPerFile,
  batchSize,
  tmpDir,
  dryRun,
}) {
  const safeFileKey = file.file_key.replace(/[^a-zA-Z0-9_-]/g, "_");
  const csvPath = path.resolve(tmpDir, `gbif_${snapshotDate}_${safeFileKey}.csv`);

  console.log(`\nProcessing ${file.file_key}`);
  console.log(file.file_uri);

  if (dryRun) {
    console.log("Dry run: skipping DuckDB extraction and API import.");
    return;
  }

  await markFileStart(file.id);

  try {
    await runDuckDbExtract({
      fileUri: file.file_uri,
      outputCsv: csvPath,
      family,
      snapshotDate,
      rowLimitPerFile,
    });

    const rows = readCsvRows(csvPath);
    console.log(`Extracted ${rows.length} ${family} row(s).`);

    if (rows.length > 0) {
      await sendRowsInBatches(rows, batchSize);
    }

    await markFileComplete({
      id: file.id,
      extractedCount: rows.length,
    });

    console.log(`Complete ${file.file_key}: ${rows.length} row(s).`);
  } catch (error) {
    await markFileFailed({
      id: file.id,
      errorMessage: error.stack || error.message || String(error),
    });

    console.error(`Failed ${file.file_key}:`, error.message || error);
  } finally {
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
  }
}

async function main() {
  const region = getArg("region", process.env.GBIF_AWS_REGION || "us-east-1");
  const snapshotDate = getArg("snapshot", process.env.GBIF_SNAPSHOT_DATE || "2026-06-01");
  const family = getArg("family", process.env.GBIF_FAMILY || "Phoridae");

  const maxFiles = Number(getArg("max-files", "5"));
  const maxAttempts = Number(getArg("max-attempts", "3"));
  const batchSize = Number(getArg("batch-size", "500"));

  const rowLimitPerFileRaw = getArg("row-limit-per-file", "");
  const rowLimitPerFile = rowLimitPerFileRaw ? Number(rowLimitPerFileRaw) : null;

  const registerLimitRaw = getArg("register-limit", "");
  const registerLimit = registerLimitRaw ? Number(registerLimitRaw) : null;

  const registerOnly = hasFlag("register-only");
  const skipRegister = hasFlag("skip-register");
  const dryRun = hasFlag("dry-run");

  const bucket = `gbif-open-data-${region}`;
  const prefix = `occurrence/${snapshotDate}/occurrence.parquet/`;

  const tmpDir = path.resolve("tmp");
  ensureDir(tmpDir);

  console.log("GBIF → API sync settings:");
  console.log({
    region,
    snapshotDate,
    family,
    bucket,
    prefix,
    maxFiles,
    maxAttempts,
    batchSize,
    rowLimitPerFile,
    registerLimit,
    registerOnly,
    skipRegister,
    dryRun,
    apiBase: process.env.GBIF_IMPORT_API_BASE,
  });

  console.log("\nTesting API health...");
  const health = await apiFetch("/health");
  console.log("API health OK:", health.mysql || health);

  if (!skipRegister) {
    console.log("\nListing GBIF parquet files from S3...");
    const keys = await listS3Keys({ bucket, prefix, region });

    const fileUris = keys.map((key) => `s3://${bucket}/${key}`);

    console.log(`Found ${fileUris.length} parquet part files.`);

    const registered = await registerFiles({
      snapshotDate,
      fileUris,
      registerLimit,
    });

    console.log(`Registered/confirmed ${registered} file(s).`);
  } else {
    console.log("\nSkipping S3 listing and file registration.");
  }

  if (registerOnly) {
    console.log("\nRegister-only mode complete.");
    return;
  }

  console.log("\nAsking API for next pending files...");
  const files = await getNextFiles({
    snapshotDate,
    maxFiles,
    maxAttempts,
  });

  console.log(`API returned ${files.length} file(s) to process.`);

  for (const file of files) {
    await processFile({
      file,
      snapshotDate,
      family,
      rowLimitPerFile,
      batchSize,
      tmpDir,
      dryRun,
    });
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});