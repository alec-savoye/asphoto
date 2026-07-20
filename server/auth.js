const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET || "asphoto-dev-secret-change-in-prod";

const MUSIC_PASSWORD_HASH = bcrypt.hashSync("shadows", 12);

function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

function musicAuthMiddleware(req, res, next) {
  const token = req.cookies && req.cookies.musicToken;
  if (!token) return res.status(401).json({ error: "Music access required" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.musicAccess) return next();
  } catch {}
  res.status(401).json({ error: "Music access required" });
}

module.exports = { authMiddleware, musicAuthMiddleware, JWT_SECRET, MUSIC_PASSWORD_HASH };
