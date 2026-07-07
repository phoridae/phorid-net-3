#!/usr/bin/env node

try {
  require("dotenv").config();
} catch (_) {
  // dotenv optional
}

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];

  return fallback;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    // leave json null
  }

  if (!response.ok) {
    throw new Error(
      `API ${response.status} ${pathname}: ${text || response.statusText}`
    );
  }

  return json;
}

function readPrescanCsv(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8");

  return parse(text, {
    columns: true,
    skip_empty_lines: true,
  });
}

function chunkArray(items, size) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

async function main() {
  const snapshotDate = getArg(
    "snapshot",
    process.env.GBIF_SNAPSHOT_DATE || "2026-06-01"
  );

  const csvPath = path.resolve(
    getArg(
      "input",
      `tmp/hyparquet_prescan_${snapshotDate}_Phoridae_clean.csv`
    )
  );

  const registerBatchSize = Number(getArg("batch-size", "500"));

  console.log("");
  console.log("Register files from hyparquet prescan");
  console.log("=====================================");
  console.log(`snapshot: ${snapshotDate}`);
  console.log(`input:    ${csvPath}`);
  console.log(`api:      ${requiredEnv("GBIF_IMPORT_API_BASE")}`);
  console.log("");

  const rows = readPrescanCsv(csvPath);

  const matchingRows = rows.filter((row) => {
    return (
      row.ok === "1" &&
      row.has_match === "1" &&
      Number(row.match_count || 0) > 0 &&
      row.s3_uri
    );
  });

  const failedRows = rows.filter((row) => row.ok !== "1");

  const predictedRows = matchingRows.reduce((sum, row) => {
    return sum + Number(row.match_count || 0);
  }, 0);

  console.log(`prescan rows:              ${rows.length}`);
  console.log(`matching files to register:${matchingRows.length}`);
  console.log(`predicted Phoridae rows:   ${predictedRows}`);
  console.log(`failed-only prescan rows:  ${failedRows.length}`);
  console.log("");

  if (failedRows.length > 0) {
    console.log("Warning: some prescan rows are still failed-only.");
    console.log("Those files will NOT be registered yet.");
    console.log("");
  }

  const files = matchingRows.map((row) => ({
    file_key: row.file_key,
    file_uri: row.s3_uri,
    expected_count: Number(row.match_count || 0),
  }));

  const batches = chunkArray(files, registerBatchSize);

  let registered = 0;

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];

    const result = await apiFetch("/files/register", {
      method: "POST",
      body: JSON.stringify({
        snapshot_date: snapshotDate,
        files: batch,
      }),
    });

    registered += batch.length;

    console.log(
      `registered batch ${i + 1}/${batches.length}: ` +
        `${registered}/${files.length}`,
      result || ""
    );
  }

  console.log("");
  console.log("Done.");
  console.log(`Registered ${registered} matching parquet files.`);
}

main().catch((error) => {
  console.error("");
  console.error("Register from prescan failed:");
  console.error(error);
  process.exit(1);
});