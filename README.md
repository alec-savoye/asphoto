# AS Photo

Alec Savoye's photography portfolio site with gallery viewing and authenticated photo upload.

## Architecture

```
HTTPS -> Caddy (reverse proxy) -> asphoto:3000 (Node.js/Express)
```

Express serves static files and handles API routes. Caddy terminates HTTPS on the `caddy_web` Docker network. The site container publishes no host ports.

## File Structure

```
asphoto/
├── server/
│   ├── index.js            Express app: static serving, auth, upload API
│   ├── auth.js             JWT auth middleware
│   └── users.json          User credential store (bcrypt-hashed passwords)
├── public/
│   ├── index.html          Splash/landing page with gallery
│   ├── login.html          Login page (existing credentials)
│   ├── upload.html         Photo upload page (auth-protected)
│   ├── styles.css          All styles (shared across pages)
│   ├── gallery.js          Gallery interaction logic (IIFE)
│   ├── gallery-data.js     Gallery/image metadata (SmugMug-sourced)
│   └── assets/             Fonts, SVGs, preview images
├── uploads/                Uploaded photos land here (gitignored, volume-mounted)
├── Dockerfile              Node.js 22 alpine, installs deps, runs server
├── compose.yaml            Single service, attaches to caddy_web
├── package.json            Express, bcrypt, jsonwebtoken, multer
├── .dockerignore           Excludes .git, node_modules, uploads
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
| Upload page | `GET /upload` | Yes (cookie) |
| Upload submit | `POST /api/upload` | Yes (cookie) |
| Logout | `POST /api/logout` | Yes |

## Deployment

```sh
docker compose build
docker compose up -d
```

The `caddy_web` network must already exist (created by the Caddy Compose project). Configure Caddy to reverse proxy to `asphoto:3000`.

## User Management

Users are stored in `server/users.json` with bcrypt-hashed passwords. 

### Generate an invite code

```sh
node -e "const r=require('./server/register');console.log(r.createInviteCode())"
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
| POST /api/login | 5 requests per IP per 15 minutes |
| POST /api/register | 3 requests per IP per hour |
| POST /api/upload | 10 requests per IP per minute |

## Upload Directory

Uploaded photos are written to `/app/uploads` inside the container, mapped to a Docker volume. Files retain the user-provided name with a sanitized filename. Only authenticated users can upload.
