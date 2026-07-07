#!/usr/bin/env node

/**
 * prescan-hyparquet.js
 *
 * Node-only GBIF Parquet prescan.
 *
 * Goal:
 *   Identify GBIF parquet part files that contain a target family, usually Phoridae,
 *   by reading only the "family" column with hyparquet.
 *
 * This does NOT:
 *   - use Docker
 *   - use DuckDB
 *   - touch your API
 *   - write to MySQL
 *
 * Resume behavior:
 *   The output CSV is treated as an append-only log.
 *
 *   On --resume:
 *     - any file_key with at least one ok=1 row is skipped
 *     - any file_key with only ok=0 rows is retried
 *     - missing file_keys are scanned
 *
 *   This means failed rows remain in the CSV for audit/history, and a later
 *   successful row for the same file_key is appended.
 *
 * Examples:
 *   node scripts/prescan-hyparquet.js --limit 25 --concurrency 2 --log-all
 *
 *   node scripts/prescan-hyparquet.js \
 *     --concurrency 4 \
 *     --resume \
 *     --output tmp/hyparquet_prescan_2026-06-01_Phoridae_full.csv
 */

try {
  require("dotenv").config();
} catch (_) {
  // dotenv is optional for this script.
}

const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];

  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function sanitizeCsv(value) {
  if (value === null || value === undefined) return "";

  const str = String(value);

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function ensureOutputCsvHeader(outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    return;
  }

  const header = [
    "file_key",
    "has_match",
    "match_count",
    "scanned_rows",
    "size_bytes",
    "elapsed_ms",
    "ok",
    "error",
    "s3_uri",
  ].join(",");

  fs.writeFileSync(outputPath, `${header}\n`, "utf8");
}

function appendPrescanResult(outputPath, result) {
  const row = [
    result.fileKey,
    result.hasMatch ? "1" : "0",
    result.matchCount,
    result.scannedRows,
    result.size,
    result.elapsedMs,
    result.ok ? "1" : "0",
    result.error || "",
    result.s3Uri,
  ]
    .map(sanitizeCsv)
    .join(",");

  fs.appendFileSync(outputPath, `${row}\n`, "utf8");
}

/**
 * Reads the existing output CSV and builds resume state.
 *
 * This intentionally treats the CSV as an append-only log:
 * - if a file ever has ok=1, it is considered successful
 * - if a file only has ok=0, it remains retryable
 */
function loadPrescanState(outputPath) {
  const state = {
    successfulFileKeys: new Set(),
    failedFileKeys: new Set(),
    totalRows: 0,
  };

  if (!fs.existsSync(outputPath)) {
    return state;
  }

  const text = fs.readFileSync(outputPath, "utf8").trim();

  if (!text) {
    return state;
  }

  const lines = text.split(/\r?\n/);

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;

    state.totalRows += 1;

    // This simple split is safe enough for file_key and ok because
    // columns before ok do not contain commas.
    const parts = line.split(",");
    const fileKey = parts[0];
    const ok = parts[6];

    if (!fileKey) continue;

    if (ok === "1") {
      state.successfulFileKeys.add(fileKey);
      state.failedFileKeys.delete(fileKey);
    } else {
      if (!state.successfulFileKeys.has(fileKey)) {
        state.failedFileKeys.add(fileKey);
      }
    }
  }

  return state;
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return response.text();
}

async function listS3ParquetFiles({ bucket, prefix, region, limit }) {
  const parser = new XMLParser({
    ignoreAttributes: false,
  });

  const files = [];
  let continuationToken = null;
  let page = 0;

  while (true) {
    page += 1;

    const params = new URLSearchParams({
      "list-type": "2",
      prefix,
      "max-keys": "1000",
    });

    if (continuationToken) {
      params.set("continuation-token", continuationToken);
    }

    const url = `https://s3.${region}.amazonaws.com/${bucket}?${params.toString()}`;

    console.log(`Listing S3 page ${page}...`);

    const xml = await fetchText(url);
    const parsed = parser.parse(xml);
    const result = parsed.ListBucketResult;

    let contents = result.Contents || [];
    if (!Array.isArray(contents)) contents = [contents];

    for (const item of contents) {
      const key = item.Key;

      if (!key || key.endsWith("/")) continue;

      const fileKey = path.basename(key);

      files.push({
        fileKey,
        key,
        size: Number(item.Size || 0),
        s3Uri: `s3://${bucket}/${key}`,
        httpsUrl: `https://s3.${region}.amazonaws.com/${bucket}/${key}`,
      });

      if (limit && files.length >= limit) {
        return files;
      }
    }

    const isTruncated = String(result.IsTruncated) === "true";
    if (!isTruncated) break;

    continuationToken = result.NextContinuationToken;
    if (!continuationToken) break;
  }

  return files;
}

let hyparquetModulesPromise = null;

async function getHyparquetModules() {
  if (!hyparquetModulesPromise) {
    hyparquetModulesPromise = Promise.all([
      import("hyparquet"),
      import("hyparquet-compressors"),
    ]).then(([hyparquet, compressorsModule]) => ({
      asyncBufferFromUrl: hyparquet.asyncBufferFromUrl,
      parquetRead: hyparquet.parquetRead,
      compressors: compressorsModule.compressors,
    }));
  }

  return hyparquetModulesPromise;
}

async function scanOneFile({ fileInfo, family, timeoutMs }) {
  const started = nowMs();

  const scanPromise = (async () => {
    const { asyncBufferFromUrl, parquetRead, compressors } =
      await getHyparquetModules();

    const file = await asyncBufferFromUrl({
      url: fileInfo.httpsUrl,
      byteLength: fileInfo.size,
    });

    let scannedRows = 0;
    let matchCount = 0;

    await parquetRead({
      file,
      columns: ["family"],
      compressors,

      onChunk(chunk) {
        if (chunk.columnName !== "family") return;

        const values = chunk.columnData || [];
        scannedRows += values.length;

        for (const value of values) {
          if (value === family) {
            matchCount += 1;
          }
        }
      },
    });

    const elapsedMs = nowMs() - started;

    return {
      ok: true,
      fileKey: fileInfo.fileKey,
      s3Uri: fileInfo.s3Uri,
      size: fileInfo.size,
      scannedRows,
      matchCount,
      hasMatch: matchCount > 0,
      elapsedMs,
      error: null,
    };
  })();

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([scanPromise, timeoutPromise]);
  } catch (error) {
    return {
      ok: false,
      fileKey: fileInfo.fileKey,
      s3Uri: fileInfo.s3Uri,
      size: fileInfo.size,
      scannedRows: 0,
      matchCount: 0,
      hasMatch: false,
      elapsedMs: nowMs() - started,
      error: error.message || String(error),
    };
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let nextIndex = 0;
  let stopRequested = false;

  function requestStop() {
    stopRequested = true;
  }

  async function runWorker(workerId) {
    while (true) {
      if (stopRequested) return;

      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) return;

      const result = await worker(items[index], index, workerId, requestStop);
      results[index] = result;
    }
  }

  const workers = [];

  for (let i = 0; i < concurrency; i += 1) {
    workers.push(runWorker(i + 1));
  }

  await Promise.all(workers);
  return results;
}

async function main() {
  const snapshotDate = getArg(
    "snapshot",
    process.env.GBIF_SNAPSHOT_DATE || "2026-06-01"
  );
  const region = getArg("region", process.env.GBIF_AWS_REGION || "us-east-1");
  const family = getArg("family", process.env.GBIF_FAMILY || "Phoridae");

  const limitArg = getArg("limit", null);
  const limit = limitArg ? Number(limitArg) : null;

  const concurrency = Number(getArg("concurrency", "4"));
  const timeoutMs = Number(getArg("timeout-ms", "600000"));
  const progressEvery = Number(getArg("progress-every", "25"));
  const maxConsecutiveErrors = Number(getArg("max-consecutive-errors", "50"));

  const resume = hasFlag("resume");
  const overwrite = hasFlag("overwrite");
  const logAll = hasFlag("log-all");

  const bucket = `gbif-open-data-${region}`;
  const prefix = `occurrence/${snapshotDate}/occurrence.parquet/`;

  const outputPath = path.resolve(
    getArg("output", `tmp/hyparquet_prescan_${snapshotDate}_${family}.csv`)
  );

  console.log("");
  console.log("GBIF hyparquet prescan");
  console.log("======================");
  console.log(`snapshot:              ${snapshotDate}`);
  console.log(`region:                ${region}`);
  console.log(`bucket:                ${bucket}`);
  console.log(`prefix:                ${prefix}`);
  console.log(`family:                ${family}`);
  console.log(`limit:                 ${limit || "all"}`);
  console.log(`concurrency:           ${concurrency}`);
  console.log(`timeout:               ${timeoutMs}ms per file`);
  console.log(`max consecutive errors:${maxConsecutiveErrors}`);
  console.log(`resume:                ${resume ? "yes" : "no"}`);
  console.log(`output:                ${outputPath}`);
  console.log("");

  if (!resume && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    if (overwrite) {
      fs.unlinkSync(outputPath);
      console.log(`Existing output deleted because --overwrite was used.`);
    } else {
      const backupPath = `${outputPath}.backup_${Date.now()}`;
      fs.renameSync(outputPath, backupPath);
      console.log(`Existing output moved to backup: ${backupPath}`);
    }
  }

  ensureOutputCsvHeader(outputPath);

  const prescanState = resume
    ? loadPrescanState(outputPath)
    : {
        successfulFileKeys: new Set(),
        failedFileKeys: new Set(),
        totalRows: 0,
      };

  const overallStarted = nowMs();

  const files = await listS3ParquetFiles({
    bucket,
    prefix,
    region,
    limit,
  });

  const filesToScan = resume
    ? files.filter((file) => !prescanState.successfulFileKeys.has(file.fileKey))
    : files;

  console.log("");
  console.log(`Found ${files.length} parquet file(s) in S3.`);
  console.log(`Existing CSV rows:       ${prescanState.totalRows}`);
  console.log(`Previously successful:   ${prescanState.successfulFileKeys.size}`);
  console.log(`Previously failed only:  ${prescanState.failedFileKeys.size}`);
  console.log(`Remaining/retry to scan: ${filesToScan.length}`);
  console.log("");

  if (filesToScan.length === 0) {
    console.log("Nothing left to scan.");
    return;
  }

  let completedThisRun = 0;
  let matchedFilesThisRun = 0;
  let failedFilesThisRun = 0;
  let totalMatchesThisRun = 0;
  let totalRowsScannedThisRun = 0;
  let consecutiveErrors = 0;
  let stoppedBecauseOfErrors = false;

  const matchingKeysThisRun = [];

  await runWithConcurrency(
    filesToScan,
    concurrency,
    async (fileInfo, index, workerId, requestStop) => {
      const result = await scanOneFile({
        fileInfo,
        family,
        timeoutMs,
      });

      completedThisRun += 1;

      appendPrescanResult(outputPath, result);

      if (result.ok) {
        consecutiveErrors = 0;
        totalRowsScannedThisRun += result.scannedRows || 0;

        if (result.hasMatch) {
          matchedFilesThisRun += 1;
          totalMatchesThisRun += result.matchCount;
          matchingKeysThisRun.push(result.fileKey);

          console.log(
            `MATCH ${result.fileKey}: ${result.matchCount} ${family} row(s), ` +
              `${result.scannedRows} family rows scanned, ` +
              `${formatSeconds(result.elapsedMs)}`
          );
          console.log(`      ${result.s3Uri}`);
        } else if (logAll) {
          console.log(
            `no ${result.fileKey}: 0 matches, ` +
              `${result.scannedRows} family rows scanned, ` +
              `${formatSeconds(result.elapsedMs)}`
          );
        }
      } else {
        failedFilesThisRun += 1;
        consecutiveErrors += 1;

        console.log(
          `ERROR ${result.fileKey}: ${result.error}, ` +
            `${formatSeconds(result.elapsedMs)}`
        );

        if (consecutiveErrors >= maxConsecutiveErrors) {
          stoppedBecauseOfErrors = true;
          console.log("");
          console.log(
            `Stopping early after ${consecutiveErrors} consecutive errors.`
          );
          console.log(
            "This usually means the internet connection dropped or S3 is temporarily unreachable."
          );
          console.log(
            "Restart later with the same --resume command; ok=1 files will be skipped."
          );
          requestStop();
        }
      }

      if (
        completedThisRun % progressEvery === 0 ||
        completedThisRun === filesToScan.length
      ) {
        const elapsedMs = nowMs() - overallStarted;
        const filesPerMinute = completedThisRun / (elapsedMs / 60000);

        console.log(
          `Progress: ${completedThisRun}/${filesToScan.length} this run, ` +
            `${matchedFilesThisRun} matching this run, ` +
            `${failedFilesThisRun} failed this run, ` +
            `${filesPerMinute.toFixed(1)} files/min, ` +
            `elapsed ${formatSeconds(elapsedMs)}`
        );
      }

      return result;
    }
  );

  const elapsedMs = nowMs() - overallStarted;
  const filesPerMinute =
    completedThisRun > 0 ? completedThisRun / (elapsedMs / 60000) : 0;

  console.log("");
  console.log("Prescan run complete");
  console.log("====================");
  console.log(`files scanned this run:   ${completedThisRun}`);
  console.log(`matched files this run:   ${matchedFilesThisRun}`);
  console.log(`failed files this run:    ${failedFilesThisRun}`);
  console.log(`total ${family} rows this run: ${totalMatchesThisRun}`);
  console.log(`family rows scanned this run: ${totalRowsScannedThisRun}`);
  console.log(`elapsed this run:         ${formatSeconds(elapsedMs)}`);
  console.log(`rate this run:            ${filesPerMinute.toFixed(1)} files/min`);
  console.log(`output CSV:               ${outputPath}`);

  if (stoppedBecauseOfErrors) {
    console.log("");
    console.log("Stopped early because of repeated errors.");
    console.log("After your connection is stable, rerun the same command with --resume.");
  }

  console.log("");
  console.log(`Matching file keys found this run (${matchingKeysThisRun.length}):`);
  console.log(matchingKeysThisRun.join(", "));
}

main().catch((error) => {
  console.error("");
  console.error("Prescan failed:");
  console.error(error);
  process.exit(1);
});