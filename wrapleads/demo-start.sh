#!/usr/bin/env bash
# demo-start.sh — one-command investor demo launcher
# Starts Postgres + the WrapLeads server inside a persistent tmux session.
# Run from the wrapleads/ directory:   bash demo-start.sh
# Then open the preview on port 3001.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION="wrapleads-demo"

cd "$SCRIPT_DIR"

echo "▶ Starting PostgreSQL…"
service postgresql start 2>/dev/null || pg_ctlcluster 16 main start 2>/dev/null || true

# Wait for pg to accept connections
for i in $(seq 1 10); do
  pg_isready -q 2>/dev/null && break
  sleep 1
done
pg_isready -q || { echo "✗ PostgreSQL failed to start"; exit 1; }
echo "  ✓ Postgres ready"

# Create user/DB if needed (idempotent)
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='wrapleads') THEN CREATE ROLE wrapleads LOGIN PASSWORD 'wrapleads'; END IF; END \$\$;" 2>/dev/null || true
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='wrapleads'" 2>/dev/null | grep -q 1 \
  || sudo -u postgres createdb -O wrapleads wrapleads 2>/dev/null || true
sudo -u postgres psql -d wrapleads -c "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>/dev/null || true
echo "  ✓ Database ready"

# Kill any existing demo tmux session
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Start server in a detached tmux window
tmux new-session -d -s "$SESSION" \
  "cd '$SCRIPT_DIR' && node wrapleads-server.js; echo '--- SERVER EXITED (press any key) ---'; read"

echo "  ▶ Server starting in tmux session '$SESSION'…"

# Wait for server to accept connections on port 3001
for i in $(seq 1 20); do
  curl -s -o /dev/null http://localhost:3001/health 2>/dev/null && break
  sleep 1
done

if curl -s -o /dev/null http://localhost:3001/health; then
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ✅  WrapLeads demo is LIVE                          ║"
  echo "║                                                      ║"
  echo "║  Open preview on port: 3001                          ║"
  echo "║  One-click demo login: enabled (Alex Rivera)         ║"
  echo "║                                                      ║"
  echo "║  To see server logs:  tmux attach -t wrapleads-demo  ║"
  echo "║  To stop:             tmux kill-session -t $SESSION  ║"
  echo "╚══════════════════════════════════════════════════════╝"
else
  echo "✗ Server didn't respond in time — check logs:"
  tmux capture-pane -p -t "$SESSION" 2>/dev/null | tail -10
  exit 1
fi
