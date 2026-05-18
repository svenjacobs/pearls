# Deployment

## Overview

The application is a SvelteKit (adapter-node) server backed by Redis. The recommended production setup uses three containers:

```
Internet → nginx (port 80/443) → pearls app (port 3000) → Redis (port 6379)
```

Two deployment options are provided:

| Option             | File(s)              | Use case                                  |
| ------------------ | -------------------- | ----------------------------------------- |
| **Compose**        | `deploy/compose.yml` | Local production test, simple single-host |
| **Podman Quadlet** | `deploy/quadlet/`    | Systemd-managed production server         |

---

## Environment variables

Copy `deploy/.env.example` to `.env` and fill in real values before deploying.

| Variable                  | Required                | Description                                                                               |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `REDIS_URL`               | Yes                     | Redis connection string, e.g. `redis://localhost:6379`                                    |
| `BASE_URL`                | Yes                     | Public URL of the application, e.g. `https://pearls.example.com`                          |
| `ORIGIN`                  | Yes                     | Must match `BASE_URL`. Required by SvelteKit's adapter-node for CSRF protection.          |
| `PORT`                    | No                      | Port the Node server binds to. Defaults to `3000`.                                        |
| `CLEANUP_SECRET`          | Yes (to enable cleanup) | Bearer token for the `/api/admin/cleanup` endpoint. Generate with `openssl rand -hex 32`. |
| `CLEANUP_STALE_GAME_DAYS` | No                      | Days without activity before a game is purged. Default: `7`.                              |

> **Note:** In the Compose deployment `REDIS_URL` is overridden automatically in `deploy/compose.yml` to use the `redis` service name. In the Quadlet pod deployment all containers share a network namespace so `redis://localhost:6379` is correct.

### Optional: Redis password

Redis is only reachable within the pod's network namespace and is not exposed to the host or internet, so a password is not required. If you want defence-in-depth, enable one as follows:

**1. Add `requirepass` to `/etc/pearls/redis.conf`:**

```bash
echo "requirepass your-secret-password" | sudo tee -a /etc/pearls/redis.conf
```

**2. Update the app's `REDIS_URL` in `/etc/pearls/pearls.env`:**

```
REDIS_URL=redis://:your-secret-password@localhost:6379
```

**3. Restart:**

```bash
systemctl --user restart pearls-redis.service pearls-app.service
```

---

## Getting the image

### Pull from registry (recommended)

Pre-built multi-arch images (amd64 + arm64) are published to the GitHub Container Registry on every release:

```bash
podman pull ghcr.io/svenjacobs/pearls:latest
# or
docker pull ghcr.io/svenjacobs/pearls:latest
```

### Building the image yourself

```bash
podman build -t ghcr.io/svenjacobs/pearls:latest .
# or
docker build -t ghcr.io/svenjacobs/pearls:latest .
```

> **Apple Silicon (ARM) Mac:** if your server runs x86-64 Linux, add `--platform linux/amd64` to build a compatible image:
>
> ```bash
> podman build --platform linux/amd64 -t ghcr.io/svenjacobs/pearls:latest .
> ```

The Dockerfile uses a multi-stage build:

1. **Builder** — installs all dependencies with pnpm and runs `pnpm build`
2. **Production** — copies only the compiled `build/` output (Vite bundles all runtime dependencies at build time; no `node_modules` needed in the final image)

### Transferring a locally built image to a remote server

If you built the image locally and don't have a container registry, export and copy it directly:

```bash
# On your development machine — save and compress
podman save ghcr.io/svenjacobs/pearls:latest | gzip > pearls.tar.gz

# Copy to server
scp pearls.tar.gz user@server:/tmp/

# On the server — import
podman load < /tmp/pearls.tar.gz
```

---

## Option 1: Compose (local production test)

Uses `deploy/compose.yml`, which starts nginx, the app, and Redis on a shared bridge network. nginx binds to host port **8080** (to avoid requiring root).

```bash
# Start (pulls ghcr.io/svenjacobs/pearls:latest automatically)
podman compose -f deploy/compose.yml up
# or
docker compose -f deploy/compose.yml up

# Verify
curl http://localhost:8080/
curl -N http://localhost:8080/api/game/events   # SSE stream, should stay open
```

To stop:

```bash
podman compose -f deploy/compose.yml down
```

---

## Option 2: Podman Quadlet

Quadlet is a systemd generator built into Podman (≥ 4.4). It converts declarative `.container`, `.pod`, `.volume` unit files into native systemd services.

### How it works

1. Unit files in `~/.config/containers/systemd/` (rootless) or `/etc/containers/systemd/` (rootful) are picked up by the `podman-system-generator` systemd generator.
2. `systemctl --user daemon-reload` triggers the generator, which produces transient systemd service files.
3. Starting any container service automatically starts its pod and any declared dependencies.

### File layout

```
deploy/quadlet/
  pearls.pod                   Pod that owns ports and shared network namespace
  pearls-redis-data.volume     Named volume for Redis AOF persistence
  pearls-redis.container       Redis 8 server
  pearls-app.container         Pearls SvelteKit server
  pearls-nginx.container       nginx reverse proxy
```

### Architecture

All containers run inside `pearls.pod`. Podman pods share a single network namespace (like Kubernetes pods), so containers communicate via `localhost`:

```
Host :80
  └── pearls pod
        ├── nginx  → localhost:3000
        ├── app    → localhost:6379
        └── redis
```

The pod publishes **port 80** to the host. Modify `pearls.pod` to also publish 443 for TLS.

### Step-by-step setup

**1. Pull the application image**

```bash
podman pull ghcr.io/svenjacobs/pearls:latest
```

**2. Copy Quadlet unit files**

For a rootless (user) setup:

```bash
mkdir -p ~/.config/containers/systemd
cp deploy/quadlet/* ~/.config/containers/systemd/
```

For a rootful (system) setup, copy to `/etc/containers/systemd/` instead.

**3. Create the environment file**

```bash
sudo mkdir -p /etc/pearls
sudo cp deploy/.env.example /etc/pearls/pearls.env
sudo nano /etc/pearls/pearls.env   # fill in real values
```

**4. Install the nginx configuration**

```bash
sudo cp deploy/nginx.conf /etc/pearls/nginx.conf
```

**5. Install the Redis configuration**

```bash
sudo cp deploy/redis.conf /etc/pearls/redis.conf
```

**6. Reload systemd and start**

```bash
systemctl --user daemon-reload

# Start the application (pod + redis + app + nginx start automatically via dependencies)
systemctl --user start pearls-app.service
```

**7. Enable on boot**

```bash
systemctl --user enable pearls-redis.service pearls-app.service pearls-nginx.service
loginctl enable-linger $USER   # keep user services running without an active login session
```

### Useful commands

```bash
# Status
systemctl --user status pearls-app.service
systemctl --user status pearls-nginx.service

# Logs
journalctl --user -u pearls-app.service -f
podman logs systemd-pearls-redis

# Restart
systemctl --user restart pearls-app.service

# Stop everything
systemctl --user stop pearls-pod.service

# Update and redeploy
podman pull ghcr.io/svenjacobs/pearls:latest
systemctl --user restart pearls-app.service
```

### Updating the application

```bash
podman pull ghcr.io/svenjacobs/pearls:latest
systemctl --user restart pearls-app.service
```

---

## Cleanup job

The `POST /api/admin/cleanup` endpoint deletes stale games (not updated in `CLEANUP_STALE_GAME_DAYS` days, default 7) and orphaned sessions from Redis. It requires a `CLEANUP_SECRET` env var — set it to a random value (see `.env.example` for generation command) and keep it secret.

A minimal Alpine container runs `crond` and calls the endpoint daily at 03:00. The crontab file is at `deploy/pearls-cleanup.cron`.

### Environment variables

| Variable                  | Required                | Description                                                                               |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `CLEANUP_SECRET`          | Yes (to enable cleanup) | Bearer token for the `/api/admin/cleanup` endpoint. Generate with `openssl rand -hex 32`. |
| `CLEANUP_STALE_GAME_DAYS` | No                      | Days without activity before a game is purged. Default: `7`.                              |

### Compose

The cleanup container is included in `deploy/compose.yml` as the `cleanup` service. It reads `CLEANUP_SECRET` from `.env` and calls the app at `http://app:3000`.

No extra setup needed — it starts automatically with `docker compose -f deploy/compose.yml up`.

### Quadlet

**1. Copy the unit file:**

```bash
cp deploy/quadlet/pearls-cleanup.container ~/.config/containers/systemd/
```

**2. Copy the crontab:**

```bash
cp deploy/pearls-cleanup.cron ~/.config/containers/systemd/pearls-cleanup.cron
```

**3. Add `CLEANUP_SECRET` to the env file:**

```bash
echo "CLEANUP_SECRET=$(openssl rand -hex 32)" | sudo tee -a /etc/pearls/pearls.env
```

**4. Reload and enable:**

```bash
systemctl --user daemon-reload
systemctl --user start pearls-cleanup.service
systemctl --user enable pearls-cleanup.service
```

### Triggering manually

```bash
# Compose
curl -sf -X POST http://localhost:8080/api/admin/cleanup \
  -H "Authorization: Bearer $(grep CLEANUP_SECRET .env | cut -d= -f2)" | jq .

# Quadlet / production
curl -sf -X POST https://pearls.example.com/api/admin/cleanup \
  -H "Authorization: Bearer $CLEANUP_SECRET" | jq .
```

---

## nginx notes

The nginx configuration in `deploy/nginx.conf` (Quadlet) and `deploy/nginx.compose.conf` (Compose) includes a dedicated location block for `/api/game/events`, the Server-Sent Events endpoint:

```nginx
location /api/game/events {
    proxy_buffering    off;
    proxy_cache        off;
    proxy_read_timeout 86400s;
    ...
}
```

- `proxy_buffering off` — required for SSE; nginx must not buffer the response before forwarding
- `proxy_read_timeout 86400s` — SSE connections are long-lived; the server sends a heartbeat comment every 25 s to keep them alive through firewalls
- The `retry: 2000` field in SSE frames instructs browsers to reconnect within 2 s after a drop

### TLS / HTTPS

Add a second `server` block for port 443 with your certificate paths and redirect HTTP to HTTPS. Example with Certbot / Let's Encrypt certificates:

```nginx
server {
    listen 80;
    server_name pearls.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name pearls.example.com;

    ssl_certificate     /etc/letsencrypt/live/pearls.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pearls.example.com/privkey.pem;

    # ... proxy locations as in nginx.conf ...
}
```

Then publish port 443 from the pod by adding `PublishPort=443:443` to `deploy/quadlet/pearls.pod`.

---

## Auth proxy (Authelia, Authentik, etc.)

Placing an auth proxy in front of the app to restrict public access requires **no changes to the application**. Auth proxies operate entirely at the nginx layer and are transparent to the SvelteKit server.

### How it works

Auth proxies like Authelia and Authentik use nginx's `auth_request` directive (or an equivalent forward-auth mechanism). nginx sends a subrequest to the auth proxy for every incoming request. If the proxy returns 200 the request passes through; otherwise the user is redirected to a login page. The SvelteKit app never sees unauthenticated requests.

The app's own session cookies (`game_session`) are independent of the auth proxy's session cookies — there is no conflict.

### nginx configuration

Add `auth_request` to **both** location blocks. The SSE endpoint must also be protected, otherwise event streams bypass the auth wall.

The SSE location's `proxy_buffering off` and `proxy_read_timeout 86400s` directives must be preserved alongside the auth directives.

Example for **Authelia** (adapt the `auth_request` URL and `error_page` to your setup):

```nginx
# Internal subrequest location for Authelia
location = /authelia {
    internal;
    proxy_pass              http://authelia:9091/api/authz/forward-auth;
    proxy_http_version      1.1;
    proxy_set_header        X-Original-URL $scheme://$http_host$request_uri;
    proxy_set_header        Content-Length "";
    proxy_pass_request_body off;
}

location /api/game/events {
    auth_request /authelia;
    error_page 401 = @authelia_redirect;

    proxy_pass          http://localhost:3000;
    proxy_http_version  1.1;
    proxy_set_header    Host               $host;
    proxy_set_header    X-Forwarded-For    $proxy_add_x_forwarded_for;
    proxy_set_header    X-Forwarded-Proto  $scheme;
    proxy_buffering     off;          # required for SSE
    proxy_cache         off;
    proxy_read_timeout  86400s;       # SSE connections are long-lived
}

location / {
    auth_request /authelia;
    error_page 401 = @authelia_redirect;

    proxy_pass          http://localhost:3000;
    proxy_http_version  1.1;
    proxy_set_header    Upgrade            $http_upgrade;
    proxy_set_header    Connection         'upgrade';
    proxy_set_header    Host               $host;
    proxy_set_header    X-Real-IP          $remote_addr;
    proxy_set_header    X-Forwarded-For    $proxy_add_x_forwarded_for;
    proxy_set_header    X-Forwarded-Proto  $scheme;
    proxy_set_header    Origin             $http_origin;
}

location @authelia_redirect {
    return 302 https://auth.example.com?rd=$scheme://$http_host$request_uri;
}
```

For **Authentik**, replace the `auth_request` subrequest location with Authentik's outpost forward-auth URL. The structure of the two app location blocks remains the same.

### SSE behaviour with auth_request

`auth_request` fires once when the SSE connection opens, not once per event. A session that expires while a stream is open will not challenge the user again until they reconnect (the next browser reconnect attempt, typically within 2 seconds, will then trigger a re-auth). This is expected behaviour.
