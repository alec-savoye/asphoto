# AS Photo - Agent Context

## Project Overview
Photography portfolio site for Alec Savoye. Vanilla HTML/CSS/JS frontend with Node.js/Express backend. Deployed via Docker behind a Caddy reverse proxy on the `caddy_web` Docker network.

## Tech Stack
- **Frontend**: Plain HTML, CSS, vanilla JS (no framework, no build step). IIFE pattern in gallery.js.
- **Backend**: Node.js 22 Alpine, Express, multer (upload), jsonwebtoken (auth), bcryptjs (passwords)
- **Serving**: Express serves static files from `public/` and handles API routes
- **Container**: Docker, compose.yaml, single service, no published host ports

## File Map
- `server/index.js` - Express app entrypoint. Static serving + API routes.
- `server/auth.js` - JWT verification middleware. Reads token from `token` cookie.
- `server/users.json` - User store: `{ "users": [{ "username": "...", "passwordHash": "..." }] }`
- `public/index.html` - Landing/splash page with gallery viewer
- `public/login.html` - Login form page
- `public/upload.html` - Auth-gated photo upload page
- `public/styles.css` - All CSS (shared across pages). Dark theme (#0a0a0a bg). Inter font.
- `public/gallery.js` - Gallery IIFE: enterSite, loadGallery, lightbox, layoutPhotos
- `public/gallery-data.js` - GALLERIES object with SmugMug image URLs. Very large file (~1000+ lines).
- `uploads/` - Destination for uploaded photos (Docker volume, gitignored)

## Style Conventions
- No comments in code unless explicitly requested
- Font: Inter (Light 300, Regular 400)
- Color palette: `#0a0a0a` bg, `#e0e0e0` text, white for emphasis, `rgb(255 255 255 / XX%)` for transparency
- Buttons: Inter font, weight 300, uppercase, letter-spacing 0.1em, 1px border at 30% white opacity
- No emoji in code or UI
- Minimalist aesthetic throughout

## API Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/login` | No | Body: `{ username, password }`. Returns Set-Cookie with JWT. Rate limited: 5/15min. |
| POST | `/api/register` | No | Body: `{ username, password, inviteCode }`. Creates account + logs in. Rate limited: 3/hr. |
| POST | `/api/logout` | Yes | Clears the token cookie. |
| POST | `/api/upload` | Yes | multipart/form-data. Fields: `photos[]` (files), `names[]` (string per file). Saves to uploads/. Rate limited: 10/min. |
| GET | `/api/me` | Yes | Returns `{ username }` if token valid. Used by upload page to verify auth. |

## Auth Flow
1. User clicks UPLOAD on splash -> redirected to /login
2. User submits credentials -> POST /api/login -> server validates against users.json -> sets httpOnly cookie with JWT
3. Login page redirects to /upload on success
4. Upload page calls GET /api/me on load; if 401, redirects to /login
5. Upload form submits -> POST /api/upload with auth cookie
6. Registration: admin generates invite code via CLI -> user visits /register with code -> account created + auto-logged-in

## Invite Code System
- `server/users.json` stores `inviteCodes` array: `{ "code": "<hex>", "used": false }`
- Admin generates codes: `node -e "const r=require('./server/register');console.log(r.createInviteCode())"`
- Each code is single-use; consumed on registration
- No public link to /register on the site; only people with a code can find it

## Gallery Architecture
- `gallery-data.js` defines `GALLERIES` global with hardcoded image metadata (SmugMug URLs)
- Film gallery dynamically fetches from SmugMug API using album keys
- `gallery.js` is an IIFE that manages landing->gallery transition, photo layout, lightbox
- Layout uses absolute positioning with pseudo-random row placement

## Docker
- `compose.yaml`: single `website` service, attaches to external `caddy_web` network (alias: `asphoto`)
- `Dockerfile`: Node 22 alpine, copies package.json + server/ + public/ + assets/
- Uploads directory is a Docker volume for persistence

## Common Tasks
- **Add a user**: Generate bcrypt hash, add to `server/users.json`
- **Generate invite code**: Run `node -e "const r=require('./server/register');console.log(r.createInviteCode())"`
- **Add gallery images**: Edit `public/gallery-data.js` GALLERIES object
- **Modify splash page**: Edit `public/index.html` #landing section + `public/styles.css` #landing rules
- **Change upload destination**: Edit `server/index.js` multer diskStorage config
