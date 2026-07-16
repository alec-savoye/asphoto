const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const { authMiddleware, JWT_SECRET } = require("./auth");
const {
  createInviteCode,
  validateInviteCode,
  consumeInviteCode,
  addUser,
  userExists,
  readData,
} = require("./register");

const app = express();
const PORT = process.env.PORT || 3000;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Too many registration attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many upload requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext);
    const safe = sanitizeFilename(base) || "photo";
    const unique = safe + "_" + Date.now() + ext;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|tiff|bmp)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  },
});

app.post("/api/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });

  const data = readData();
  const user = data.users.find((u) => u.username === username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  bcrypt.compare(password, user.passwordHash).then((match) => {
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ success: true });
  });
});

app.post("/api/register", registerLimiter, (req, res) => {
  const { username, password, inviteCode } = req.body;
  if (!username || !password || !inviteCode) {
    return res.status(400).json({ error: "Missing fields" });
  }
  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ error: "Username must be 2-30 characters" });
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    return res.status(400).json({ error: "Username: letters, numbers, hyphens, underscores only" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!validateInviteCode(inviteCode)) {
    return res.status(400).json({ error: "Invalid or used invite code" });
  }
  if (userExists(username)) {
    return res.status(409).json({ error: "Username already taken" });
  }

  bcrypt.hash(password, 12).then((hash) => {
    consumeInviteCode(inviteCode);
    addUser(username, hash);

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ success: true });
  });
});

app.post("/api/logout", authMiddleware, (_req, res) => {
  res.clearCookie("token", { path: "/" });
  res.json({ success: true });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

app.post("/api/upload", uploadLimiter, authMiddleware, upload.array("photos", 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const names = req.body.names || [];
  const renamed = req.files.map((file, i) => {
    const desiredName = names[i] ? sanitizeFilename(names[i]) : null;
    if (desiredName) {
      const ext = path.extname(file.filename);
      const newName = desiredName + ext;
      const newPath = path.join(UPLOADS_DIR, newName);
      if (newName !== file.filename) {
        try {
          fs.renameSync(path.join(UPLOADS_DIR, file.filename), newPath);
        } catch {
          return { original: file.originalname, saved: file.filename };
        }
      }
      return { original: file.originalname, saved: newName };
    }
    return { original: file.originalname, saved: file.filename };
  });

  res.json({ success: true, files: renamed });
});

app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/api/uploads", (_req, res) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp|tiff|bmp)$/i;
  let files;
  try {
    files = fs.readdirSync(UPLOADS_DIR).filter((f) => allowed.test(f));
  } catch {
    files = [];
  }
  const images = files.map((f) => ({
    title: f.replace(/_[0-9]+(\.\w+)$/, "$1").replace(/_/g, " ").replace(/\.\w+$/, ""),
    caption: "",
    largeUrl: "/uploads/" + f,
    mediumUrl: "/uploads/" + f,
    thumbnailUrl: "/uploads/" + f,
    archivedUri: "/uploads/" + f,
  }));
  res.json(images);
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/register", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "register.html"));
});

app.get("/upload", authMiddleware, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "upload.html"));
});

app.use((_req, res, next) => {
  if (_req.accepts("html") && _req.method === "GET" && !_req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  } else {
    next();
  }
});

app.listen(PORT, () => {
  console.log("AS Photo running on port " + PORT);
});
