const path = require("path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const TAXONOMY_DATABASE = "johnhash_phorid_taxonomy";
const configuredDatabase =
  process.env.TAXONOMY_DB_NAME || TAXONOMY_DATABASE;

if (configuredDatabase !== TAXONOMY_DATABASE) {
  throw new Error(
    `TAXONOMY_DB_NAME must be ${TAXONOMY_DATABASE}, received ${configuredDatabase}`
  );
}

const taxonomyPool = mysql.createPool({
  host: process.env.TAXONOMY_DB_HOST || "localhost",
  port: Number(process.env.TAXONOMY_DB_PORT || 3306),
  user: process.env.TAXONOMY_DB_USER,
  password: process.env.TAXONOMY_DB_PASSWORD,
  database: configuredDatabase,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: "utf8mb4",
  supportBigNumbers: true,
  bigNumberStrings: true,
});

module.exports = taxonomyPool;
