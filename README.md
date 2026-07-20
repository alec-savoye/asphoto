# AS Photo

Alec Savoye's photography portfolio + music streaming site. Gallery viewing, authenticated photo upload, and music library streaming.

## Architecture

```
HTTPS -> Caddy (reverse proxy) -> asphoto:3000 (Node.js/Express)
```

Express serves static files and handles API routes. Caddy terminates HTTPS on the `caddy_web` Docker network. The site container publishes no host ports.

## File Structure

```
asphoto/
├── server/
│   ├── index.js            Express app: static serving, auth, upload API, music indexing
│   ├── auth.js             JWT auth middleware
│   ├── register.js         Invite code management + user creation
│   └── users.json          User store + invite codes (bcrypt-hashed passwords)
├── public/
│   ├── index.html          Splash/landing page with gallery + Upload/Music buttons
│   ├── login.html          Login page (existing credentials)
│   ├── register.html       Registration page (invite code required)
│   ├── upload.html         Photo upload page (auth-protected, XHR progress bar)
│   ├── music.html          Music library browser + player
│   ├── styles.css          All styles (shared across pages)
│   ├── gallery.js          Gallery interaction logic (IIFE)
│   ├── gallery-data.js     Gallery/image metadata (SmugMug-sourced)
│   └── assets/             Fonts, SVGs, preview images (bind-mounted from RAID)
├── uploads/                Uploaded photos (gitignored, bind-mounted from RAID)
├── Dockerfile              Node.js 22 alpine, installs deps, runs server
├── compose.yaml            Single service, bind mounts, attaches to caddy_web
├── package.json            Express, bcrypt, jsonwebtoken, multer, music-metadata, cookie-parser, express-rate-limit
├── .dockerignore           Excludes .git, node_modules, uploads
├── .gitignore              uploads/, node_modules/
├── AGENTS.md               Context file for AI coding sessions
└── README.md               This file
```

## Key Flows

| Flow | Path | Auth? |
|------|------|-------|
| Gallery splash | `GET /` | No |
| Gallery view | `GET /` (JS-driven) | No |
| Login page | `GET /login` | No |
| Login submit | `POST /api/login` | No |
| Register page | `GET /register` | No |
| Register submit | `POST /api/register` | No |
| Upload page | `GET /upload` | Yes (cookie) |
| Upload submit | `POST /api/upload` | Yes (cookie) |
| Music player | `GET /music` | No |
| Music library | `GET /api/music` | No |
| Music stream | `GET /api/music/stream?path=...` | No |
| User uploads gallery | `GET /api/uploads` | No |
| Logout | `POST /api/logout` | Yes |

## Deployment

```sh
docker compose build
docker compose up -d
```

The `caddy_web` network must already exist (created by the Caddy Compose project). Configure Caddy to reverse proxy to `asphoto:3000`.

Caddy config at `~/workspace/caddy/Caddyfiles/Caddyfile`:
```
alecsavoye.com {
  reverse_proxy asphoto:3000
}
```

## User Management

Users are stored in `server/users.json` with bcrypt-hashed passwords.

### Generate an invite code

```sh
docker exec asphoto-website-1 node -e "const r=require('./server/register');console.log(r.createInviteCode())"
```

Share the printed code with the person you want to invite. They visit `/register` and enter the code + their credentials. The code is single-use and consumed on registration.

### Manually add a user (alternative)

```sh
node -e "const b=require('bcryptjs');b.hash('PASSWORD',12).then(h=>console.log(h))"
```

Then add the hash to `users.json`:

```json
{ "users": [{ "username": "name", "passwordHash": "<hash>" }] }
```

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Global (all endpoints) | 300 req/min per IP |
| POST /api/login | 5 req/15min per IP |
| POST /api/register | 3 req/hr per IP |
| POST /api/upload | 10 req/min per IP |
| GET /api/music/stream | 30 req/min per IP |

## Data Paths (RAID Array)

All persistent data stored on `/srv/active-raid/`, not the root/boot drive:

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `/srv/active-raid/LIBRARIES/247/photosite/uploads` | `/app/uploads` | Uploaded photos (rw) |
| `/srv/active-raid/LIBRARIES/247/photosite/assets` | `/app/public/assets` | Site assets (rw) |
| `/srv/active-raid/MEDIA/music/MUSIC` | `/app/music` | Music library (ro) |
| `/srv/active-raid/LIBRARIES/247/photosite/cache` | `/app/cache` | Music index cache (rw) |
| `./server/users.json` | `/app/server/users.json` | User store (rw) |

## Music Library

- Music files are bind-mounted read-only from the host — no copying
- Server pre-indexes at boot: walks directory, parses metadata, caches to `/app/cache/music.json`
- If cache exists, loads instantly. If not, indexes in background and reports progress
- Streaming with range request support and correct MIME types per format
- macOS `._*` metadata files filtered out

## Upload Directory

Uploaded photos are written to `/app/uploads` inside the container, bind-mounted to the RAID array. Files retain the user-provided name with a sanitized filename. Only authenticated users can upload.
