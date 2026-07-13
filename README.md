# AS Photo

A minimal photography placeholder served by nginx behind an existing Caddy
reverse proxy. The page uses plain HTML and CSS; there is no application runtime
or build step.

## Network layout

Public traffic should follow this path:

```text
HTTPS -> Caddy -> asphoto:80
```

Caddy terminates HTTPS. The site container does not publish a host port, so its
HTTP endpoint is available only to containers attached to Caddy's external
Docker network, `caddy_web`.

The existing Caddy Compose project defines that network as `web`; Compose gives
it the project-scoped name `caddy_web`. Configure Caddy's site route for your
domain to reverse proxy to `asphoto:80`. Caddy configuration, DNS, and firewall
management intentionally remain outside this repository.

## Deployment commands

Review the files before running these commands. They change Docker state and
should only be run after approval on the host:

```sh
docker compose build
docker compose up -d
```

Start the neighboring Caddy Compose project first so that `caddy_web` exists.
This project intentionally treats that network as external and does not create
or manage it.

To verify that the site has no published host ports:

```sh
docker compose ps
```

After adding the route to Caddy, verify that the public domain redirects HTTP to
HTTPS and presents a valid certificate.
