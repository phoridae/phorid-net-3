require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const app = express();

app.use(express.json({ limit: "10mb" }));

const databasePools = [
  { label: "legacy", pool: require("./db") },
  { label: "GBIF", pool: require("./dbGbif") },
  { label: "taxonomy", pool: require("./dbTaxonomy") },
];

async function checkDatabaseConnection({ label, pool }) {
  try {
    const [rows] = await pool.query("SELECT DATABASE() AS database_name");
    console.log(`DB OK [${label}]: ${rows[0].database_name}`);
  } catch (err) {
    console.error(`DB connection check failed [${label}]:`, err.message);
  }
}

void Promise.all(databasePools.map(checkDatabaseConnection));

// CORS (simple, dev-friendly)
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || allowedOrigins[0]);
  }

  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// healtch check route
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "phorid-net-api",
    env: process.env.NODE_ENV || "unknown",
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/flies", require("./routes/flies"));
app.use("/api/dropbox", require("./routes/dropbox"));
app.use("/api/gbif-import", require("./routes/gbifImport"));
app.use("/api/admin/gbif", require("./routes/gbifOccurrences"));
app.use("/api/taxonomy", require("./routes/taxonomy"));

// Errors
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🪰 Backend running on http://localhost:${PORT}`);
});
