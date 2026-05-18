#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
bun run db:migrate

echo "[entrypoint] Starting maison-core on port ${PORT:-3000}..."
exec bun src/index.ts
