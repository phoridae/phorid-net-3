const admin = require("../services/firebaseAdmin");

async function requireAdmin(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    const idToken = authHeader.split("Bearer ")[1];

    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (decodedToken.admin !== true) {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.user = decodedToken;
    next();
  } catch (err) {
    console.error("Auth failed:", err);
    return res.status(401).json({ error: "Invalid or expired auth token" });
  }
}

module.exports = requireAdmin;