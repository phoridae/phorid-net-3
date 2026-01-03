const express = require("express");
const router = express.Router();
const pool = require("../db");
const keyCharacters = require("../data/keyCharacters");

/**
 * GET /flies/speciesList?selectedGenus
 */
router.get("/speciesList", async (req, res, next) => {
  try {
    const { selectedGenus } = req.query;
    if (!selectedGenus) {
      return res.status(400).json({ error: "selectedGenus is required" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, genus, specific_epithet, habitus_image
      FROM species
      WHERE genus = ?
        AND specific_epithet <> 'Unidentified'
      ORDER BY specific_epithet
      `,
      [selectedGenus]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /flies/speciesInfo?id
 */
router.get("/speciesInfo", async (req, res, next) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        p.first_name,
        p.last_name,
        s.id,
        s.genus,
        s.specific_epithet,
        s.year,
        s.diagnosis,
        s.habitus_image
      FROM species s
      JOIN species_people sp ON s.id = sp.species_id
      JOIN people p ON p.id = sp.people_id
      WHERE s.id = ?
      `,
      [id]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /flies/keyCharacters?selectedGenus
 */
router.get("/keyCharacters", async (req, res, next) => {
  try {
    const { selectedGenus } = req.query;
    const characters = keyCharacters[selectedGenus];

    if (!characters) {
      return res.status(400).json({ error: "Unknown genus" });
    }

    const [rows] = await pool.query(
      `
      SELECT sd.*
      FROM species_descriptions sd
      JOIN species s ON sd.species_id = s.id
      WHERE s.genus = ?
      `,
      [selectedGenus]
    );

    const result = {};
    for (const char of characters) {
      result[char] = [...new Set(rows.map(r => r[char]))];
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /flies/selectedCharacters?selectedGenus&<character>=<value>
 */
router.get("/selectedCharacters", async (req, res, next) => {
  try {
    const { selectedGenus, ...filters } = req.query;
    const characters = keyCharacters[selectedGenus];

    if (!characters) {
      return res.status(400).json({ error: "Unknown genus" });
    }

    let sql = `
      SELECT *
      FROM species_descriptions sd
      JOIN species s ON sd.species_id = s.id
      WHERE s.genus = ?
    `;
    const params = [selectedGenus];

    for (const char of characters) {
      if (filters[char] && filters[char] !== "all") {
        sql += ` AND sd.${char} = ?`;
        params.push(filters[char]);
      }
    }

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
