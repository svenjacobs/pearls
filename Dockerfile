# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:26-alpine AS builder

# node-gyp (required by cpu-features and ssh2 native addons) needs python3, make, g++
RUN apk add --no-cache python3 make g++
RUN npm install -g corepack && corepack enable

WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:26-alpine

# tini runs as PID 1 and forwards signals (SIGTERM) to Node. Without it Node
# runs as PID 1 and ignores signals, forcing Docker to SIGKILL after the timeout.
RUN apk add --no-cache tini

WORKDIR /app

# All runtime dependencies are bundled by Vite at build time — only the
# compiled output is needed. See AGENTS.md for the devDependencies rationale.
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build/index.js"]
