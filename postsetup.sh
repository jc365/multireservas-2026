#!/usr/bin/env bash
# ==============================================================================
# postsetup.sh — fullstack-events-starter post-initialization
#
# Instala dependencias, arranca PostgreSQL, sincroniza el schema y siembra
# la base de datos. Idempotente y con flags para saltar pasos.
#
# Usage:
#   ./postsetup.sh                 # instalación completa
#   ./postsetup.sh --skip-docker   # no levanta PostgreSQL (ya está corriendo)
#   ./postsetup.sh --skip-install  # no hace npm install (ya instalado)
#   ./postsetup.sh --skip-seed     # no siembra la BD (ya sembrada)
#   ./postsetup.sh --dry-run       # solo muestra lo que haría
# ==============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}ℹ ${NC}$*"; }
ok()    { echo -e "${GREEN}✔ ${NC}$*"; }
warn()  { echo -e "${YELLOW}⚠ ${NC}$*"; }
err()   { echo -e "${RED}✘ ${NC}$*" >&2; }

# ── Flags ─────────────────────────────────────────────────────────────────────
SKIP_DOCKER=false
SKIP_INSTALL=false
SKIP_SEED=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-docker)  SKIP_DOCKER=true; shift ;;
    --skip-install) SKIP_INSTALL=true; shift ;;
    --skip-seed)    SKIP_SEED=true; shift ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--skip-docker] [--skip-install] [--skip-seed] [--dry-run]"
      exit 0 ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

run() {
  if $DRY_RUN; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# ── Detect project name ───────────────────────────────────────────────────────
# Source of truth: package.json "name" (set by setup.sh). Fallback: directory name.
if [[ -f package.json ]]; then
  PROJECT_NAME=$(grep -oE '"name": *"[^"]+"' package.json | head -1 | sed -E 's/.*"name": *"([^"]+)".*/\1/' || true)
fi
if [[ -z "${PROJECT_NAME:-}" || "$PROJECT_NAME" == *"{{"* ]]; then
  PROJECT_NAME=$(basename "$PWD")
  warn "package.json name not set; using directory name: $PROJECT_NAME"
fi

CONTAINER_NAME="${PROJECT_NAME}-db"

# ── 1. Install dependencies ───────────────────────────────────────────────────
if ! $SKIP_INSTALL; then
  info "Installing dependencies (root, backend, frontend)..."
  info "Dependencies of root..."
  run npm install
  info "Dependencies of backend..."
  run npm --prefix backend install
  info "Dependencies of frontend..."
  run npm --prefix frontend install
  ok "Dependencies installed (Prisma generated via postinstall)"
else
  info "Skipping npm install"
fi

# ── 2. Start PostgreSQL ───────────────────────────────────────────────────────
if ! $SKIP_DOCKER; then
  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker not found. Skipping PostgreSQL startup."
    warn "Start your own PostgreSQL and set DATABASE_URL in backend/.env"
  else
    info "Starting PostgreSQL via docker compose..."
    run docker compose up -d

    info "Waiting for PostgreSQL to be healthy..."
    healthy=false
    for i in $(seq 1 30); do
      status=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
      if [[ "$status" == "healthy" ]]; then
        ok "PostgreSQL is ready"
        healthy=true
        break
      fi
      sleep 1
    done

    if ! $healthy; then
      warn "PostgreSQL did not become healthy in 30s. Check 'docker compose logs'."
    fi
  fi
else
  info "Skipping docker compose up"
fi

# ── 3. Sync schema ────────────────────────────────────────────────────────────
info "Syncing database schema (db push)..."
run npm --prefix backend run db:push
ok "Schema synced"

# ── 4. Seed ───────────────────────────────────────────────────────────────────
if ! $SKIP_SEED; then
  info "Seeding database..."
  run npm --prefix backend run db:seed
  ok "Database seeded"
else
  info "Skipping seed"
fi

# ── 5. Install orchestrator venv ────────────────────────────────────────────────
if [[ -d orchestration ]] && [[ -f orchestration/requirements.txt ]]; then
  info "Setting up orchestrator Python venv..."
  if ! command -v python3 >/dev/null 2>&1; then
    warn "python3 not found. Skipping orchestrator venv."
  else
    if [[ ! -d orchestration/venv ]]; then
      run python3 -m venv orchestration/venv
    fi
    run orchestration/venv/bin/pip install -q -r orchestration/requirements.txt
    ok "Orchestrator venv ready"
  fi
fi

# ── 6. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
if $DRY_RUN; then
  echo "  POSTSETUP DRY RUN COMPLETE"
else
  echo "  POSTSETUP COMPLETE"
fi
echo "════════════════════════════════════════"
echo ""
if ! $DRY_RUN; then
  echo "  Next:"
  echo "    npm run dev:all      # DB + backend + frontend + orquestador"
  echo ""
  echo "  Or individually:"
  echo "    npm run dev:back     # backend"
  echo "    npm run dev:front    # frontend"
  echo "    npm run dev:orches   # orquestador"
  echo ""
fi
echo "════════════════════════════════════════"
