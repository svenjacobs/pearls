#!/bin/sh
# Resolve the container runtime socket and run integration tests.
#
# Priority:
#   1. DOCKER_HOST already set — use it as-is (caller knows best).
#   2. Podman is installed — auto-detect the socket path and set env vars.
#   3. Docker is installed — DOCKER_HOST is not needed (Docker Desktop sets it).
#   4. Neither found — fail with a clear error message.

if [ -n "${DOCKER_HOST}" ]; then
  # Caller already exported DOCKER_HOST; nothing to configure.
  :
elif command -v podman > /dev/null 2>&1; then
  if [ "$(uname)" = "Darwin" ]; then
    socket=$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')
  else
    socket="${XDG_RUNTIME_DIR}/podman/podman.sock"
  fi
  export DOCKER_HOST="unix://${socket}"
  export TESTCONTAINERS_RYUK_DISABLED=true
elif command -v docker > /dev/null 2>&1; then
  # Docker is available; DOCKER_HOST is typically set by Docker Desktop already.
  :
else
  echo "error: neither Podman nor Docker found. Install one and try again." >&2
  exit 1
fi

exec pnpm exec vitest run --config vitest.integration.config.ts "$@"
