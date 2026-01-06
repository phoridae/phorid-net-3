const express = require("express");
const { searchDropbox, getTemporaryLink } = require("../services/dropbox");

const router = express.Router();

router.get("/search", async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing query parameter q" });
  }

  try {
    const results = await searchDropbox(q); // adjust path if needed
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Dropbox search failed" });
  }
});

router.get("/open", async (req, res) => {
  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  try {
    const link = await getTemporaryLink(path);
    res.json({ link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to open PDF" });
  }
});



module.exports = router;
