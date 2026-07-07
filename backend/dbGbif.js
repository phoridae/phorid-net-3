const mysql = require("mysql2/promise");

const gbifPool = mysql.createPool({
  host: process.env.GBIF_DB_HOST || "localhost",
  user: process.env.GBIF_DB_USER,
  password: process.env.GBIF_DB_PASSWORD,
  database: process.env.GBIF_DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: "utf8mb4",
});

module.exports = gbifPool;