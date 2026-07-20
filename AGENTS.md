# AS Photo - Agent Context

## Project Overview
Photography portfolio + music streaming site for Alec Savoye. Vanilla HTML/CSS/JS frontend with Node.js/Express backend. Deployed via Docker behind a Caddy reverse proxy on the `caddy_web` Docker network.

## Tech Stack
- **Frontend**: Plain HTML, CSS, vanilla JS (no framework, no build step). IIFE pattern in gallery.js.
- **Backend**: Node.js 22 Alpine, Express 5, multer (upload), jsonwebtoken (auth), bcryptjs (passwords), music-metadata (music indexing), cookie-parser, express-rate-limit
- **Serving**: Express serves static files from `public/` and handles API routes. `trust proxy` enabled (behind Caddy).
- **Container**: Docker, compose.yaml, single service, no published host ports

## File Map
- `server/index.js` - Express app entrypoint. Static serving, API routes, music indexing, rate limiting.
- `server/auth.js` - JWT verification middleware. Reads token from `token` cookie. Secret from `JWT_SECRET` env var.
- `server/register.js` - Invite code CRUD: createInviteCode, validateInviteCode, consumeInviteCode, addUser, userExists.
- `server/users.json` - User store + invite codes: `{ "users": [...], "inviteCodes": [...] }`
- `public/index.html` - Landing/splash page with gallery viewer + UPLOAD + Music buttons
- `public/login.html` - Login form page
- `public/register.html` - Registration form (invite code required)
- `public/upload.html` - Auth-gated photo upload page (XHR with progress bar)
- `public/music.html` - Music library browser + player (track list, album grouping, audio element)
- `public/styles.css` - All CSS (shared across pages). Dark theme (#0a0a0a bg). Inter font.
- `public/gallery.js` - Gallery IIFE: enterSite, loadGallery, lightbox, layoutPhotos, loadUserUploads (fullscreen viewer), uploads view with click-to-advance zoom/fade
- `public/gallery-data.js` - GALLERIES object with SmugMug image URLs. Very large file (~1000+ lines).

## Style Conventions
- No comments in code unless explicitly requested
- Font: Inter (Light 300, Regular 400)
- Color palette: `#0a0a0a` bg, `#e0e0e0` text, white for emphasis, `rgb(255 255 255 / XX%)` for transparency
- Buttons: Inter font, weight 300, uppercase, letter-spacing 0.1em, 1px border at 30% white opacity, min-width 200px (splash buttons use `.landing-btn` class)
- No emoji in code or UI
- Minimalist aesthetic throughout

## API Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/login` | No | Body: `{ username, password }`. Returns Set-Cookie with JWT. Rate limited: 5/15min. |
| POST | `/api/register` | No | Body: `{ username, password, inviteCode }`. Creates account + logs in. Rate limited: 3/hr. |
| POST | `/api/logout` | Yes | Clears the token cookie. |
| POST | `/api/upload` | Yes | multipart/form-data. Fields: `photos[]` (files), `names[]` (string per file). Saves to uploads/. Rate limited: 10/min. |
| GET | `/api/me` | Yes | Returns `{ username }` if token valid. |
| GET | `/api/uploads` | No | Returns JSON array of uploaded images from uploads dir. |
| GET | `/api/music` | No | Returns JSON array of music tracks with metadata. Cached to disk. While indexing returns `{ status: "indexing", progress, total }`. |
| GET | `/api/music/stream?path=...` | No | Streams audio file with range request support. Correct MIME types per format. Rate limited: 30/min. |

## Auth Flow
1. User clicks UPLOAD on splash -> redirected to /login
2. User submits credentials -> POST /api/login -> server validates against users.json -> sets httpOnly cookie with JWT (7d expiry, SameSite=Strict, Secure in prod)
3. Login page redirects to /upload on success
4. Upload page calls GET /api/me on load; if 401, redirects to /login
5. Upload form submits via XHR with progress bar -> POST /api/upload with auth cookie
6. Registration: admin generates invite code via CLI -> user visits /register with code -> account created + auto-logged-in

## Invite Code System
- `server/users.json` stores `inviteCodes` array: `{ "code": "<hex>", "used": false }`
- Admin generates codes: `docker exec asphoto-website-1 node -e "const r=require('./server/register');console.log(r.createInviteCode())"`
- Each code is single-use; consumed on registration
- No public link to /register on the site; only people with a code can find it

## Gallery Architecture
- `gallery-data.js` defines `GALLERIES` global with hardcoded image metadata (SmugMug URLs)
- Film gallery dynamically fetches from SmugMug API using album keys
- `gallery.js` is an IIFE that manages landing->gallery transition, photo layout, lightbox
- Layout uses absolute positioning with pseudo-random row placement
- User Uploads gallery: fullscreen immersive view, hides header/nav, click to zoom/fade to next, loops, arrow keys + Escape, "Back" link on hover

## Music Architecture
- Music files read-only bind-mounted from host at `/app/music`
- Server pre-indexes library at boot: walks directory, parses metadata via music-metadata, writes cache to `/app/cache/music.json`
- If no cache exists at boot, background indexing runs; API returns indexing progress
- Client polls during indexing showing "Indexing library... N/M"
- Streaming supports HTTP range requests for seeking; MIME type mapped per extension (.m4a->audio/mp4, .flac->audio/flac, etc.)
- macOS `._*` metadata files are filtered out

## Docker
- `compose.yaml`: single `website` service, attaches to external `caddy_web` network (alias: `asphoto`)
- `Dockerfile`: Node 22 alpine, copies package.json + server/ + public/
- Bind mounts (all on RAID array `/srv/active-raid/`):
  - `/srv/active-raid/LIBRARIES/247/photosite/uploads:/app/uploads` - uploaded photos
  - `/srv/active-raid/LIBRARIES/247/photosite/assets:/app/public/assets` - site assets (fonts, preview images)
  - `/srv/active-raid/MEDIA/music/MUSIC:/app/music:ro` - music library (read-only)
  - `/srv/active-raid/LIBRARIES/247/photosite/cache:/app/cache` - music index cache
  - `./server/users.json:/app/server/users.json` - user store (persists across rebuilds)
- Environment: `JWT_SECRET`, `NODE_ENV=production`

## Caddy
- Caddyfile at `~/workspace/caddy/Caddyfiles/Caddyfile`
- `alecsavoye.com` -> `reverse_proxy asphoto:3000`
- `asphoto.duckdns.org` -> `reverse_proxy 192.168.0.137:2283` (Immich)
- After changes to Caddyfile: restart Caddy (`docker compose restart` in caddy dir)

## Rate Limits
| Scope | Limit |
|-------|-------|
| Global (all endpoints) | 300 req/min per IP |
| POST /api/login | 5 req/15min per IP |
| POST /api/register | 3 req/hr per IP |
| POST /api/upload | 10 req/min per IP |
| GET /api/music/stream | 30 req/min per IP |

## Common Tasks
- **Add a user**: Generate bcrypt hash, add to `server/users.json`
- **Generate invite code**: `docker exec asphoto-website-1 node -e "const r=require('./server/register');console.log(r.createInviteCode())"`
- **Add gallery images**: Edit `public/gallery-data.js` GALLERIES object
- **Modify splash page**: Edit `public/index.html` #landing section + `public/styles.css` .landing-btn rules
- **Change upload destination**: Edit `server/index.js` UPLOADS_DIR + compose.yaml bind mount
- **Change music source**: Edit compose.yaml music bind mount path
- **Clear music cache**: `rm /srv/active-raid/LIBRARIES/247/photosite/cache/music.json` then restart container
- **Rebuild after code changes**: `docker compose up -d --build`
- **Restart Caddy**: `docker compose restart` in `~/workspace/caddy/`
- **Reset rate limits**: `docker compose restart` (rate limits are in-memory)

## Owner Preferences
- All persistent data (uploads, assets, cache) stored on RAID array at `/srv/active-raid/LIBRARIES/247/photosite/`, NOT on the root/boot drive
- Music library is read-only from the host filesystem at `/srv/active-raid/MEDIA/music/MUSIC` — no copying, just bind mount
- Always rebuild Docker (`docker compose up -d --build`) after code changes
- Show actual error messages in UI, not generic "failed" text
- No emoji anywhere
- No comments in code unless explicitly asked
- Dark minimalist aesthetic: black backgrounds, subtle white borders, Inter font
- Favicon on all pages: SmugMug image of `clintlydONE_002-L.jpg`
