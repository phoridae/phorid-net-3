require("dotenv").config();
const express = require("express");
const app = express();

app.use(express.json());

const pool = require("./db");

(async () => {
  const [rows] = await pool.query("SELECT 1");
  console.log("DB OK:", rows);
})();

// CORS (simple, dev-friendly)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Routes
app.use("/flies", require("./routes/flies"));

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
