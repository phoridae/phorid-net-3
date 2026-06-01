const express = require("express");
const { searchDropbox, getTemporaryLink } = require("../services/dropbox");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

// Everything below this line requires admin access.
router.use(requireAdmin);

router.get("/search", async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ error: "Missing query parameter q" });
  }

  try {
    const results = await searchDropbox(q.trim());
    res.json({ results });
  } catch (err) {
    console.error("Dropbox search failed:", err);
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
    console.error("Failed to open PDF:", err);
    res.status(500).json({ error: "Failed to open PDF" });
  }
});

module.exports = router;