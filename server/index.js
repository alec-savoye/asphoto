const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const mm = require("music-metadata");
const archiver = require("archiver");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const { authMiddleware, musicAuthMiddleware, JWT_SECRET, MUSIC_PASSWORD_HASH } = require("./auth");
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
app.set("trust proxy", 1);

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

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: "Too many requests. Slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const musicStreamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many stream requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.use(globalLimiter);
app.use(express.static(path.join(__dirname, "..", "public"), { maxAge: "1h" }));

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MUSIC_DIR = process.env.MUSIC_DIR || path.join(__dirname, "..", "music");

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
    const allowed = /\.(jpg|jpeg|png|gif|webp|tiff|tif|bmp)$/i;
    if (!allowed.test(path.extname(file.originalname))) {
      _req.fileValidationError = "File type not allowed: " + path.extname(file.originalname);
      return cb(null, false);
    }
    cb(null, true);
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
  if (req.fileValidationError) {
    return res.status(400).json({ error: req.fileValidationError });
  }
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

const MUSIC_EXTS = /\.(mp3|flac|wav|ogg|aac|m4a|wma|opus)$/i;
const JAMS_EXTS = /\.(mp3|flac|wav|ogg|aac|m4a|wma|opus|caf|mov|MOV|mp4)$/i;

const JAMS_DIR = process.env.JAMS_DIR || path.join(__dirname, "..", "jams");

const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, "..", "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
const MUSIC_CACHE_FILE = path.join(CACHE_DIR, "music.json");
const JAMS_CACHE_FILE = path.join(CACHE_DIR, "jams.json");

function readMusicCache() {
  try {
    var raw = fs.readFileSync(MUSIC_CACHE_FILE, "utf8");
    var data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch {}
  return null;
}

function writeMusicCache(tracks) {
  try {
    fs.writeFileSync(MUSIC_CACHE_FILE, JSON.stringify(tracks));
  } catch {}
}

function readJamsCache() {
  try {
    var raw = fs.readFileSync(JAMS_CACHE_FILE, "utf8");
    var data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch {}
  return null;
}

function writeJamsCache(tracks) {
  try {
    fs.writeFileSync(JAMS_CACHE_FILE, JSON.stringify(tracks));
  } catch {}
}

var musicMemCache = null;
var musicMemCacheTime = 0;
var MUSIC_CACHE_TTL = 30 * 60 * 1000;
var musicIndexing = null;

var jamsMemCache = null;
var jamsMemCacheTime = 0;
var jamsIndexing = null;

function walkDir(dir, exts, skipDirs) {
  var results = [];
  try {
    var list = fs.readdirSync(dir);
  } catch {
    return results;
  }
  list.forEach(function (file) {
    if (file.startsWith("._")) return;
    var fp = path.join(dir, file);
    try {
      var stat = fs.statSync(fp);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      var lower = file.toLowerCase();
      if (lower.endsWith(".logicx") || lower.endsWith(".app") || lower.endsWith(".framework") || lower.endsWith(".nosync") || file === "Project File Backups" || file === "Alternatives" || file === "Media" || file === "Audio Files" || file === "Freeze Files.nosync" || file === "Resources" || file === "RANDOM TECH" || file === "Bounces") return;
      if (skipDirs && skipDirs.indexOf(file) >= 0) return;
      results = results.concat(walkDir(fp, exts, skipDirs));
    } else if (exts.test(file)) {
      results.push(fp);
    }
  });
  return results;
}

app.post("/api/music/auth", (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Missing password" });
  bcrypt.compare(password, MUSIC_PASSWORD_HASH).then((match) => {
    if (!match) return res.status(401).json({ error: "Wrong password" });
    const token = jwt.sign({ musicAccess: true }, JWT_SECRET, { expiresIn: "30d" });
    res.cookie("musicToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ success: true });
  });
});

app.get("/api/music", async (_req, res) => {
  if (musicMemCache && Date.now() - musicMemCacheTime < MUSIC_CACHE_TTL) {
    return res.json(musicMemCache);
  }

  var diskCache = readMusicCache();
  if (diskCache) {
    musicMemCache = diskCache;
    musicMemCacheTime = Date.now();
    return res.json(diskCache);
  }

  if (musicIndexing) {
    return res.json({ status: "indexing", progress: musicIndexing.progress, total: musicIndexing.total });
  }

  var files = walkDir(MUSIC_DIR, MUSIC_EXTS);
  var tracks = [];
  musicIndexing = { progress: 0, total: files.length };
  for (var i = 0; i < files.length; i++) {
    var fp = files[i];
    var rel = path.relative(MUSIC_DIR, fp);
    try {
      var metadata = await mm.parseFile(fp, { duration: false });
      var common = metadata.common;
      tracks.push({
        id: i,
        path: rel,
        title: common.title || path.basename(fp, path.extname(fp)),
        artist: common.artist || "",
        album: common.album || "",
        year: common.year || "",
        track: common.track ? common.track.no : null,
        duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
      });
    } catch (err) {
      tracks.push({
        id: i,
        path: rel,
        title: path.basename(fp, path.extname(fp)),
        artist: "",
        album: "",
        year: "",
        track: null,
        duration: null,
        error: err.message,
      });
    }
    musicIndexing.progress = i + 1;
  }

  musicMemCache = tracks;
  musicMemCacheTime = Date.now();
  musicIndexing = null;
  writeMusicCache(tracks);
  res.json(tracks);
});

app.get("/api/music/stream", musicStreamLimiter, (req, res) => {
  var rel = req.query.path;
  if (!rel) return res.status(400).json({ error: "Missing path" });
  var fp = path.join(MUSIC_DIR, rel);
  if (!fp.startsWith(MUSIC_DIR)) return res.status(403).json({ error: "Forbidden" });
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });

  var ext = path.extname(fp).toLowerCase();
  var transcode = req.query.transcode === "1";
  var needsTranscode = transcode || [".m4a", ".aac", ".wma", ".opus"].includes(ext);

  if (needsTranscode) {
    res.setHeader("Content-Type", "audio/mpeg");
    var { spawn } = require("child_process");
    var ffmpeg = spawn("ffmpeg", ["-i", fp, "-f", "mp3", "-ab", "192k", "-"]);
    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.resume();
    req.on("close", function () { ffmpeg.kill(); });
    return;
  }

  var stat = fs.statSync(fp);
  var mime = "audio/mpeg";
  if (ext === ".m4a") mime = "audio/x-m4a";
  else if (ext === ".aac") mime = "audio/aac";
  else if (ext === ".flac") mime = "audio/flac";
  else if (ext === ".wav") mime = "audio/wav";
  else if (ext === ".ogg") mime = "audio/ogg";
  else if (ext === ".opus") mime = "audio/ogg";
  else if (ext === ".wma") mime = "audio/x-ms-wma";
  else if (ext === ".aif" || ext === ".aiff") mime = "audio/aiff";
  else if (ext === ".caf") mime = "audio/x-caf";
  else if (ext === ".mov" || ext === ".mp4") mime = "video/quicktime";

  res.setHeader("Content-Type", mime);
  res.setHeader("Accept-Ranges", "bytes");

  var range = req.headers.range;
  if (range) {
    var parts = range.replace(/bytes=/, "").split("-");
    var start = parseInt(parts[0], 10);
    var end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    var chunkSize = end - start + 1;
    res.status(206);
    res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + stat.size);
    res.setHeader("Content-Length", chunkSize);
    fs.createReadStream(fp, { start: start, end: end }).pipe(res);
  } else {
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(fp).pipe(res);
  }
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

app.get("/music", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "music.html"));
});

app.get("/about", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "about.html"));
});

app.get("/api/jams", async (_req, res) => {
  if (jamsMemCache) {
    return res.json(jamsMemCache);
  }

  var diskCache = readJamsCache();
  if (diskCache) {
    jamsMemCache = diskCache;
    jamsMemCacheTime = Date.now();
    return res.json(diskCache);
  }

  if (jamsIndexing) {
    return res.json({ status: "indexing", progress: jamsIndexing.progress, total: jamsIndexing.total });
  }

  var files = walkDir(JAMS_DIR, JAMS_EXTS, ["MUSIC"]);
  var tracks = [];
  jamsIndexing = { progress: 0, total: files.length };
  for (var i = 0; i < files.length; i++) {
    var fp = files[i];
    var rel = path.relative(JAMS_DIR, fp);
    try {
      var metadata = await mm.parseFile(fp, { duration: false });
      var common = metadata.common;
      tracks.push({
        id: i,
        path: rel,
        title: common.title || path.basename(fp, path.extname(fp)),
        artist: common.artist || "",
        album: common.album || "",
        year: common.year || "",
        track: common.track ? common.track.no : null,
        duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
        image: "/assets/jams/jam_" + (i + 1) + ".jpg",
      });
    } catch (err) {
      tracks.push({
        id: i,
        path: rel,
        title: path.basename(fp, path.extname(fp)),
        artist: "",
        album: "",
        year: "",
        track: null,
        duration: null,
        image: "/assets/jams/jam_" + (i + 1) + ".jpg",
        error: err.message,
      });
    }
    jamsIndexing.progress = i + 1;
  }

  jamsMemCache = tracks;
  jamsMemCacheTime = Date.now();
  jamsIndexing = null;
  writeJamsCache(tracks);
  res.json(tracks);
});

app.get("/api/jams/stream", musicStreamLimiter, (req, res) => {
  var rel = req.query.path;
  if (!rel) return res.status(400).json({ error: "Missing path" });
  var fp = path.join(JAMS_DIR, rel);
  if (!fp.startsWith(JAMS_DIR)) return res.status(403).json({ error: "Forbidden" });
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });

  var ext = path.extname(fp).toLowerCase();
  var transcode = req.query.transcode === "1";
  var needsTranscode = transcode || [".m4a", ".aac", ".wma", ".opus", ".aif", ".aiff", ".caf"].includes(ext);

  if (needsTranscode) {
    res.setHeader("Content-Type", "audio/mpeg");
    var { spawn } = require("child_process");
    var ffmpeg = spawn("ffmpeg", ["-i", fp, "-f", "mp3", "-ab", "192k", "-"]);
    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.resume();
    req.on("close", function () { ffmpeg.kill(); });
    return;
  }

  var stat = fs.statSync(fp);
  var mime = "audio/mpeg";
  if (ext === ".flac") mime = "audio/flac";
  else if (ext === ".wav") mime = "audio/wav";
  else if (ext === ".ogg") mime = "audio/ogg";
  else if (ext === ".mov" || ext === ".mp4") mime = "video/quicktime";

  res.setHeader("Content-Type", mime);
  res.setHeader("Accept-Ranges", "bytes");

  var range = req.headers.range;
  if (range) {
    var parts = range.replace(/bytes=/, "").split("-");
    var start = parseInt(parts[0], 10);
    var end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    var chunkSize = end - start + 1;
    res.status(206);
    res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + stat.size);
    res.setHeader("Content-Length", chunkSize);
    fs.createReadStream(fp, { start: start, end: end }).pipe(res);
  } else {
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(fp).pipe(res);
  }
});

app.get("/jams", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "jams.html"));
});

app.get("/api/music/download/:album", musicAuthMiddleware, (req, res) => {
  var album = req.params.album;
  var diskCache = readMusicCache();
  if (!diskCache) return res.status(404).json({ error: "Library not indexed yet" });

  var albumTracks = diskCache.filter(function (t) {
    return t.album === album;
  });
  if (albumTracks.length === 0) return res.status(404).json({ error: "Album not found" });

  var safeName = album.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_") || "album";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName + ".zip\"");

  var archive = archiver("zip", { zlib: { level: 1 } });
  archive.on("error", function (err) {
    console.error("Zip error:", err.message);
  });
  archive.pipe(res);

  albumTracks.forEach(function (t) {
    var fp = path.join(MUSIC_DIR, t.path);
    if (fs.existsSync(fp)) {
      archive.file(fp, { name: path.basename(t.path) });
    }
  });

  archive.finalize();
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

  if (!readMusicCache()) {
    console.log("Pre-indexing music library...");
    var files = walkDir(MUSIC_DIR, MUSIC_EXTS);
    console.log("Found " + files.length + " music files. Parsing metadata...");
    (async function () {
      var tracks = [];
      for (var i = 0; i < files.length; i++) {
        var fp = files[i];
        var rel = path.relative(MUSIC_DIR, fp);
        try {
          var metadata = await mm.parseFile(fp, { duration: false });
          var common = metadata.common;
          tracks.push({
            id: i,
            path: rel,
            title: common.title || path.basename(fp, path.extname(fp)),
            artist: common.artist || "",
            album: common.album || "",
            year: common.year || "",
            track: common.track ? common.track.no : null,
            duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
          });
        } catch {
          tracks.push({
            id: i,
            path: rel,
            title: path.basename(fp, path.extname(fp)),
            artist: "",
            album: "",
            year: "",
            track: null,
            duration: null,
          });
        }
        if (i % 100 === 0) console.log("Parsed " + i + "/" + files.length);
      }
      musicMemCache = tracks;
      musicMemCacheTime = Date.now();
      writeMusicCache(tracks);
      console.log("Music indexing complete. " + tracks.length + " tracks cached.");
    })();
  } else {
    console.log("Music cache found. Skipping re-index.");
  }

  if (!readJamsCache()) {
    console.log("Pre-indexing jams library...");
    var jamFiles = walkDir(JAMS_DIR, JAMS_EXTS, ["MUSIC"]);
    console.log("Found " + jamFiles.length + " jam files. Parsing metadata...");
    (async function () {
      var tracks = [];
      for (var i = 0; i < jamFiles.length; i++) {
        var fp = jamFiles[i];
        var rel = path.relative(JAMS_DIR, fp);
        try {
          var metadata = await mm.parseFile(fp, { duration: false });
          var common = metadata.common;
          tracks.push({
            id: i,
            path: rel,
            title: common.title || path.basename(fp, path.extname(fp)),
            artist: common.artist || "",
            album: common.album || "",
            year: common.year || "",
            track: common.track ? common.track.no : null,
            duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
            image: "/assets/jams/jam_" + (i + 1) + ".jpg",
          });
        } catch {
          tracks.push({
            id: i,
            path: rel,
            title: path.basename(fp, path.extname(fp)),
            artist: "",
            album: "",
            year: "",
            track: null,
            duration: null,
            image: "/assets/jams/jam_" + (i + 1) + ".jpg",
          });
        }
      }
      jamsMemCache = tracks;
      writeJamsCache(tracks);
      console.log("Jams indexing complete. " + tracks.length + " tracks cached.");
    })();
  } else {
    console.log("Jams cache found. Skipping re-index.");
  }
});
