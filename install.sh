#!/usr/bin/env bash
# Install dependencies for the wrapleads server and frontend.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but not installed." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR}" -lt 18 ]; then
  echo "Warning: Node 18+ recommended (found: $(node -v 2>/dev/null || echo none))" >&2
fi

echo "==> Installing wrapleads server dependencies"
( cd wrapleads && npm ci 2>/dev/null || npm install )

echo "==> Installing wrapleads frontend dependencies"
( cd wrapleads/frontend && npm ci 2>/dev/null || npm install )

if [ ! -f wrapleads/.env ] && [ -f wrapleads/.env.example ]; then
  cp wrapleads/.env.example wrapleads/.env
  echo "==> Created wrapleads/.env from .env.example (fill in real values)"
fi

cat <<'EOF'

Done. Next steps:
  1. Edit wrapleads/.env with your credentials.
  2. Apply the database schema:  psql "$DATABASE_URL" -f wrapleads/schema.sql
  3. Start the server:           cd wrapleads && npm start
  4. Start the frontend dev UI:  cd wrapleads/frontend && npm run dev
EOF
