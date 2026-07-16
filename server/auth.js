const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "asphoto-dev-secret-change-in-prod";

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

module.exports = { authMiddleware, JWT_SECRET };
