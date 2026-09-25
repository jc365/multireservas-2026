#!/usr/bin/env bash
# ==============================================================================
# setup.sh — fullstack-events-starter project initializer
#
# Usage:
#   ./setup.sh <project-name>              # First-time setup (prompts ports)
#   ./setup.sh --ports                     # Change ports on configured repo
#   ./setup.sh <project-name> --dry-run    # Preview changes without applying
#   ./setup.sh <project-name> --force      # Bypass original-repo guard
#
# Configured detection: {{PROJECT_NAME}} present → unconfigured; absent → configured.
# ==============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Globals ───────────────────────────────────────────────────────────────────
DRY_RUN=false
FORCE=false
PORTS_ONLY=false
PROJECT_NAME=""
AUTHOR=""
DOMAIN=""
ADMIN_EMAIL=""
CHANGES=0

# Port defaults (overwritten by prompts / --ports reads)
BACKEND_PORT=3000
FRONTEND_PORT=5173
ORCHESTRATOR_PORT=8080
POSTGRES_PORT=5433

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo -e "${CYAN}ℹ ${NC}$*"; }
ok()    { echo -e "${GREEN}✔ ${NC}$*"; }
warn()  { echo -e "${YELLOW}⚠ ${NC}$*"; }
err()   { echo -e "${RED}✘ ${NC}$*" >&2; }

to_pascal() {
  echo "$1" | sed -r 's/(^|-)([a-z])/\U\2/g'
}

to_snake() {
  echo "$1" | tr '-' '_'
}

# ── Configured / placeholder detection ────────────────────────────────────────
has_placeholder() {
  # package.json is always processed by setup — reliable marker
  grep -q '{{PROJECT_NAME}}' package.json 2>/dev/null
}

is_configured() {
  ! has_placeholder
}

# ── Original-repo guard (Part B) ──────────────────────────────────────────────
guard_original_repo() {
  if [[ "$(basename "$PWD")" == "fullstack-events-starter" ]] && ! $FORCE; then
    err "Este es el repo original del starter (fullstack-events-starter)."
    err "Ejecutar setup.sh aquí reescribiría los placeholders del template."
    echo ""
    echo "  Clona el starter y ejecuta setup.sh dentro del clon:"
    echo "    git clone <repo> mi-proyecto && cd mi-proyecto && ./setup.sh mi-proyecto"
    echo ""
    echo "  Si realmente necesitas forzarlo en este directorio:"
    echo "    ./setup.sh <nombre> --force"
    exit 1
  fi
}

# ── Argument parsing ──────────────────────────────────────────────────────────
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      --force)
        FORCE=true
        shift
        ;;
      --ports)
        PORTS_ONLY=true
        shift
        ;;
      --help|-h)
        echo "Usage:"
        echo "  $0 <project-name> [--dry-run] [--force]   First-time setup"
        echo "  $0 --ports [--dry-run] [--force]          Change ports on configured repo"
        echo ""
        echo "  <project-name>  Kebab-case name (e.g. my-app)"
        echo "  --dry-run        Preview changes without applying"
        echo "  --force          Bypass original-repo guard (fullstack-events-starter)"
        echo "  --ports          Re-prompt and rewrite only the 4 service ports"
        exit 0
        ;;
      -*)
        err "Unknown option: $1"
        exit 1
        ;;
      *)
        if [[ -z "$PROJECT_NAME" ]]; then
          PROJECT_NAME="$1"
        fi
        shift
        ;;
    esac
  done
}

validate_name() {
  local name="$1"
  if [[ ! "$name" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
    err "Invalid project name: '$name'"
    echo "  Must be kebab-case: lowercase, starts with letter, hyphens allowed."
    echo "  Examples: my-app, my-project, events-starter"
    exit 1
  fi
}

# ── Read current ports (for --ports defaults) ─────────────────────────────────
read_env_key() {
  local file="$1" key="$2" default="$3"
  if [[ -f "$file" ]]; then
    local val
    val=$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- || true)
    if [[ -n "$val" ]]; then
      echo "$val"
      return
    fi
  fi
  echo "$default"
}

read_current_ports() {
  BACKEND_PORT=$(read_env_key backend/.env PORT 3000)
  FRONTEND_PORT=$(read_env_key frontend/.env VITE_PORT 5173)
  ORCHESTRATOR_PORT=$(read_env_key orchestration/.env ORCHESTRATOR_PORT 8080)

  # DATABASE_URL port
  if [[ -f backend/.env ]]; then
    local db_url
    db_url=$(grep -E '^DATABASE_URL=' backend/.env | head -1 || true)
    if [[ "$db_url" =~ localhost:([0-9]+) ]]; then
      POSTGRES_PORT="${BASH_REMATCH[1]}"
    fi
  fi

  # docker-compose host port (fallback / cross-check)
  if [[ -f docker-compose.yml ]]; then
    local dc_port
    dc_port=$(grep -oE '"[0-9]+:5432"' docker-compose.yml | head -1 | tr -d '"' | cut -d: -f1 || true)
    if [[ -n "$dc_port" ]]; then
      POSTGRES_PORT="$dc_port"
    fi
  fi
}

# ── Interactive prompts ────────────────────────────────────────────────────────
prompt_missing() {
  if [[ -z "$PROJECT_NAME" ]]; then
    read -rp "Project name (kebab-case, e.g. my-app): " PROJECT_NAME
    if [[ -z "$PROJECT_NAME" ]]; then
      err "Project name is required."
      exit 1
    fi
  fi
  validate_name "$PROJECT_NAME"

  if [[ -z "$AUTHOR" ]]; then
    local default_author="The ${PROJECT_NAME} contributors"
    read -rp "Author [$default_author]: " AUTHOR
    AUTHOR="${AUTHOR:-$default_author}"
  fi

  if [[ -z "$DOMAIN" ]]; then
    read -rp "Domain [example.com]: " DOMAIN
    DOMAIN="${DOMAIN:-example.com}"
  fi

  if [[ -z "$ADMIN_EMAIL" ]]; then
    read -rp "Admin email [admin@${DOMAIN}]: " ADMIN_EMAIL
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"
  fi
}

prompt_ports() {
  echo ""
  info "Service ports (press Enter to keep default):"
  local input

  read -rp "  Backend port [$BACKEND_PORT]: " input
  BACKEND_PORT="${input:-$BACKEND_PORT}"

  read -rp "  Frontend port [$FRONTEND_PORT]: " input
  FRONTEND_PORT="${input:-$FRONTEND_PORT}"

  read -rp "  Orchestrator port [$ORCHESTRATOR_PORT]: " input
  ORCHESTRATOR_PORT="${input:-$ORCHESTRATOR_PORT}"

  read -rp "  PostgreSQL host port [$POSTGRES_PORT]: " input
  POSTGRES_PORT="${input:-$POSTGRES_PORT}"

  # Basic sanity: numeric, 1-65535
  local p
  for p in "$BACKEND_PORT" "$FRONTEND_PORT" "$ORCHESTRATOR_PORT" "$POSTGRES_PORT"; do
    if ! [[ "$p" =~ ^[0-9]+$ ]] || (( p < 1 || p > 65535 )); then
      err "Invalid port: '$p' (must be 1-65535)"
      exit 1
    fi
  done
}

# ── Replace in file ───────────────────────────────────────────────────────────
replace_in_file() {
  local file="$1"
  local old="$2"
  local new="$3"

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  if grep -q "$old" "$file" 2>/dev/null; then
    if $DRY_RUN; then
      echo "  [dry-run] $file: '$old' → '$new'"
    else
      sed -i "s|$old|$new|g" "$file"
    fi
    CHANGES=$((CHANGES + 1))
  fi
}

# Set KEY=VALUE in a .env-style file (append if missing)
set_env_key() {
  local file="$1" key="$2" value="$3"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  if $DRY_RUN; then
    echo "  [dry-run] $file: ${key}=${value}"
    return 0
  fi
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
  CHANGES=$((CHANGES + 1))
}

# Replace a specific old→new string in a file; warn if pattern not found
replace_or_warn() {
  local file="$1" old="$2" new="$3" desc="$4"
  if [[ "$old" == "$new" ]]; then
    return 0
  fi
  if [[ ! -f "$file" ]]; then
    warn "File not found for ${desc}: $file"
    return 0
  fi
  if ! grep -qF "$old" "$file" 2>/dev/null; then
    warn "Pattern not found for ${desc} in $file (expected: '$old') — skipped"
    return 0
  fi
  if $DRY_RUN; then
    echo "  [dry-run] $file: '$old' → '$new' (${desc})"
  else
    # Literal replace (no regex) via Python — safe for URLs/paths
    python3 -c '
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding="utf-8") as f:
    content = f.read()
with open(path, "w", encoding="utf-8") as f:
    f.write(content.replace(old, new))
' "$file" "$old" "$new"
  fi
  CHANGES=$((CHANGES + 1))
}

# ── Write ports literally to all service config sites ─────────────────────────
write_ports() {
  info "Writing ports (literal)..."

  # 1. docker-compose.yml — postgres host port
  if [[ -f docker-compose.yml ]]; then
    local old_dc new_dc
    old_dc=$(grep -oE '"[0-9]+:5432"' docker-compose.yml | head -1 | tr -d '"' || true)
    new_dc="\"${POSTGRES_PORT}:5432\""
    if [[ -n "$old_dc" && "$old_dc" != "$new_dc" ]]; then
      replace_or_warn docker-compose.yml "\"$old_dc\"" "$new_dc" "postgres host port"
    elif [[ -n "$old_dc" ]]; then
      : # already correct
    else
      warn "Postgres port pattern not found in docker-compose.yml"
    fi
  fi

  # 2. backend/.env — PORT, CORS_ORIGIN, DATABASE_URL
  if [[ -f backend/.env ]]; then
    set_env_key backend/.env PORT "$BACKEND_PORT"
    set_env_key backend/.env CORS_ORIGIN "http://localhost:${FRONTEND_PORT}"
    # DATABASE_URL: replace host port only
    if grep -qE '^DATABASE_URL=.*localhost:[0-9]+' backend/.env 2>/dev/null; then
      if $DRY_RUN; then
        echo "  [dry-run] backend/.env: DATABASE_URL localhost:* → localhost:${POSTGRES_PORT}"
      else
        sed -i "s|@localhost:[0-9]*|@localhost:${POSTGRES_PORT}|g" backend/.env
      fi
      CHANGES=$((CHANGES + 1))
    else
      warn "DATABASE_URL pattern not found in backend/.env"
    fi
  fi

  # 3. frontend/.env — VITE_PORT, VITE_BACKEND_URL
  if [[ -f frontend/.env ]]; then
    set_env_key frontend/.env VITE_PORT "$FRONTEND_PORT"
    set_env_key frontend/.env VITE_BACKEND_URL "http://localhost:${BACKEND_PORT}"
  fi

  # 4. orchestration/.env — ORCHESTRATOR_PORT, BACKEND_URL
  if [[ -f orchestration/.env ]]; then
    set_env_key orchestration/.env ORCHESTRATOR_PORT "$ORCHESTRATOR_PORT"
    set_env_key orchestration/.env BACKEND_URL "http://localhost:${BACKEND_PORT}"
  fi

  # 5. frontend/vite.config.ts — proxy targets + server port
  if [[ -f frontend/vite.config.ts ]]; then
    # Read old backend port from proxy if present
    local old_be
    old_be=$(grep -oE 'localhost:[0-9]+' frontend/vite.config.ts | head -1 | cut -d: -f2 || true)
    if [[ -n "$old_be" ]]; then
      replace_or_warn frontend/vite.config.ts "http://localhost:${old_be}" "http://localhost:${BACKEND_PORT}" "vite proxy"
    fi
    # server.port (if present as port: NNNN)
    local old_fe
    old_fe=$(grep -oE 'port: *[0-9]+' frontend/vite.config.ts | head -1 | grep -oE '[0-9]+' || true)
    if [[ -n "$old_fe" ]]; then
      replace_or_warn frontend/vite.config.ts "port: ${old_fe}" "port: ${FRONTEND_PORT}" "vite server.port"
    elif [[ -n "$FRONTEND_PORT" ]]; then
      # Ensure port key exists — only if server block already has structure
      if grep -q 'server: {' frontend/vite.config.ts 2>/dev/null && ! grep -qE 'port: *[0-9]+' frontend/vite.config.ts; then
        if $DRY_RUN; then
          echo "  [dry-run] frontend/vite.config.ts: add port: ${FRONTEND_PORT}"
        else
          sed -i "s|server: {|server: {\n    port: ${FRONTEND_PORT},|" frontend/vite.config.ts
        fi
        CHANGES=$((CHANGES + 1))
      fi
    fi
  fi

  # 6. frontend/playwright.config.ts — baseURL + webServer.url
  if [[ -f frontend/playwright.config.ts ]]; then
    local old_pw
    old_pw=$(grep -oE 'localhost:[0-9]+' frontend/playwright.config.ts | head -1 | cut -d: -f2 || true)
    if [[ -n "$old_pw" ]]; then
      replace_or_warn frontend/playwright.config.ts "http://localhost:${old_pw}" "http://localhost:${FRONTEND_PORT}" "playwright baseURL"
      # second occurrence (webServer.url) — sed already replaced all if same pattern
    fi
  fi

  # 7. vitest.config.ts + tests/globalSetup.ts — test DB port
  for f in vitest.config.ts tests/globalSetup.ts; do
    if [[ -f "$f" ]]; then
      local old_db
      old_db=$(grep -oE 'localhost:[0-9]+' "$f" | head -1 | cut -d: -f2 || true)
      if [[ -n "$old_db" ]]; then
        replace_or_warn "$f" "localhost:${old_db}" "localhost:${POSTGRES_PORT}" "test DB port"
      fi
    fi
  done

  # 8. tests/REST Client/.env (if exists) + .env.example on first copy handled below
  if [[ -f "tests/REST Client/.env" ]]; then
    local old_rc_be old_rc_or
    old_rc_be=$(grep -oE 'localhost:[0-9]+' "tests/REST Client/.env" | head -1 | cut -d: -f2 || true)
    if [[ -n "$old_rc_be" ]]; then
      replace_or_warn "tests/REST Client/.env" "http://localhost:${old_rc_be}" "http://localhost:${BACKEND_PORT}" "REST client backend"
    fi
    old_rc_or=$(grep -oE 'localhost:[0-9]+' "tests/REST Client/.env" | sed -n '2p' | cut -d: -f2 || true)
    # orche_de is second URL — simpler: replace any localhost:8080-style after first
    if grep -qE '^orche_de=http://localhost:[0-9]+' "tests/REST Client/.env" 2>/dev/null; then
      if $DRY_RUN; then
        echo "  [dry-run] tests/REST Client/.env: orche_de → :${ORCHESTRATOR_PORT}"
      else
        sed -i "s|^orche_de=http://localhost:[0-9]*|orche_de=http://localhost:${ORCHESTRATOR_PORT}|" "tests/REST Client/.env"
      fi
      CHANGES=$((CHANGES + 1))
    fi
  fi
}

# ── Apply PROJECT_NAME replacements ───────────────────────────────────────────
apply_replacements() {
  local PASCAL SNAKE
  PASCAL=$(to_pascal "$PROJECT_NAME")
  SNAKE=$(to_snake "$PROJECT_NAME")

  info "Replacing placeholders across project..."

  local files
  files=$(find . -type f \
    -not -path './.git/*' \
    -not -path './node_modules/*' \
    -not -path './.opencode/skills/*' \
    -not -path './.opencode/node_modules/*' \
    -not -path './backend/node_modules/*' \
    -not -path './frontend/node_modules/*' \
    -not -path './orchestration/venv/*' \
    -not -path './__pycache__/*' \
    -not -path './orchestration/__pycache__/*' \
    -not -path './orchestration/utils/__pycache__/*' \
    -not -path './orchestration/webhooks/__pycache__/*' \
    -not -path './orchestration/workflows/__pycache__/*' \
    -not -path './coverage/*' \
    -not -path './backend/dev.db' \
    -not -path './backend/test.db' \
    -not -path './backend/uploads/*' \
    -not -name '*.db' \
    -not -name '*.sqlite' \
    -not -name '*.lock' \
    -not -name 'package-lock.json' \
    -not -name '*.sql' \
    -not -name '*.png' -not -name '*.jpg' -not -name '*.ico' \
    -not -name '*.woff' -not -name '*.woff2' -not -name '*.ttf' \
    -not -name '*.eot' \
    -not -name 'setup.sh' \
    2>/dev/null || true)

  while IFS= read -r file; do
    replace_in_file "$file" "{{PROJECT_NAME}}" "$PROJECT_NAME"
  done <<< "$files"

  while IFS= read -r file; do
    replace_in_file "$file" "{{PROJECT_NAME_PASCAL}}" "$PASCAL"
  done <<< "$files"

  while IFS= read -r file; do
    replace_in_file "$file" "{{PROJECT_NAME_SNAKE}}" "$SNAKE"
  done <<< "$files"

  while IFS= read -r file; do
    replace_in_file "$file" "{{AUTHOR}}" "$AUTHOR"
  done <<< "$files"

  while IFS= read -r file; do
    replace_in_file "$file" "{{DOMAIN}}" "$DOMAIN"
  done <<< "$files"

  while IFS= read -r file; do
    replace_in_file "$file" "{{ADMIN_EMAIL}}" "$ADMIN_EMAIL"
  done <<< "$files"
}

# ── Update LICENSE author ─────────────────────────────────────────────────────
update_license() {
  if [[ ! -f "LICENSE" ]]; then
    return 0
  fi

  local current_author
  current_author=$(grep -oP 'Copyright \(c\) \d+ \K.+' LICENSE 2>/dev/null || true)

  if [[ "$current_author" != "$AUTHOR" ]]; then
    if $DRY_RUN; then
      echo "  [dry-run] LICENSE: '$current_author' → '$AUTHOR'"
    else
      local year
      year=$(date +%Y)
      sed -i "s|Copyright (c) .*|Copyright (c) $year $AUTHOR|" LICENSE
    fi
    CHANGES=$((CHANGES + 1))
  fi
}

# ── Copy .env.example → .env ──────────────────────────────────────────────────
copy_env_files() {
  if $DRY_RUN; then
    return 0
  fi
  echo ""
  echo "→ Copying .env.example to .env (if missing)..."
  [ -f backend/.env.example ] && [ ! -f backend/.env ] && cp backend/.env.example backend/.env && echo "  ✓ backend/.env"
  [ -f frontend/.env.example ] && [ ! -f frontend/.env ] && cp frontend/.env.example frontend/.env && echo "  ✓ frontend/.env"
  [ -f orchestration/.env.example ] && [ ! -f orchestration/.env ] && cp orchestration/.env.example orchestration/.env && echo "  ✓ orchestration/.env"
  [ -f "tests/REST Client/.env.example" ] && [ ! -f "tests/REST Client/.env" ] && cp "tests/REST Client/.env.example" "tests/REST Client/.env" && echo "  ✓ tests/REST Client/.env"
  echo ""
  echo "⚠ IMPORTANT: Edit the .env files with your real credentials (DATABASE_URL, JWT_SECRET, etc.)"
}

# ── Summary ────────────────────────────────────────────────────────────────────
print_ports_summary() {
  echo ""
  echo "  Puertos elegidos:"
  echo "    Backend:      $BACKEND_PORT"
  echo "    Frontend:     $FRONTEND_PORT"
  echo "    Orquestador:  $ORCHESTRATOR_PORT"
  echo "    PostgreSQL:   $POSTGRES_PORT"
  echo ""
  echo "  Si alguno está ocupado al arrancar, usa ./setup.sh --ports para cambiarlo."
}

print_summary() {
  local PASCAL SNAKE
  PASCAL=$(to_pascal "$PROJECT_NAME")
  SNAKE=$(to_snake "$PROJECT_NAME")

  echo ""
  echo "════════════════════════════════════════════════════════"
  if $DRY_RUN; then
    echo "  DRY RUN SUMMARY"
  else
    echo "  SETUP COMPLETE"
  fi
  echo "════════════════════════════════════════════════════════"
  echo ""
  echo "  Project name:     $PROJECT_NAME"
  echo "  PascalCase:       $PASCAL"
  echo "  snake_case:       $SNAKE"
  echo "  Author:           $AUTHOR"
  echo "  Domain:           $DOMAIN"
  echo "  Admin email:      $ADMIN_EMAIL"
  echo ""
  print_ports_summary
  echo ""
  echo "  Changes applied:  $CHANGES files modified"
  echo ""

  if ! $DRY_RUN; then
    echo "  Next steps:"
    echo "    1. Edit .env files with your real credentials (DATABASE_URL, JWT_SECRET, etc.)"
    echo "    2. ./postsetup.sh        # instala, arranca PostgreSQL y siembra la BD"
    echo "    3. npm run dev:all       # arrancia DB + backend + frontend + orquestador"
    echo ""
  fi
  echo "════════════════════════════════════════════════════════"
}

print_ports_summary_only() {
  echo ""
  echo "════════════════════════════════════════════════════════"
  echo "  PORTS UPDATED"
  echo "════════════════════════════════════════════════════════"
  print_ports_summary
  echo ""
  echo "  Changes applied:  $CHANGES files modified"
  echo "════════════════════════════════════════════════════════"
}

# ── Main ───────────────────────────────────────────────────────────────────────
main() {
  parse_args "$@"
  guard_original_repo

  # ── --ports mode ──────────────────────────────────────────────────────────
  if $PORTS_ONLY; then
    if has_placeholder; then
      err "Este repo no ha sido configurado. Ejecuta ./setup.sh <nombre> primero."
      exit 1
    fi
    read_current_ports
    info "Current ports (Enter to keep):"
    prompt_ports
    if $DRY_RUN; then
      info "DRY RUN mode — no files will be modified"
    fi
    write_ports
    print_ports_summary_only
    exit 0
  fi

  # ── First-time setup ──────────────────────────────────────────────────────
  if is_configured; then
    err "Este repo ya está configurado."
    err "Para cambiar puertos: ./setup.sh --ports"
    err "Para reconfigurar desde cero: re-clona el starter."
    exit 1
  fi

  prompt_missing
  read_current_ports   # defaults for prompts (template values)
  prompt_ports

  if $DRY_RUN; then
    info "DRY RUN mode — no files will be modified"
    echo ""
  fi

  apply_replacements
  update_license
  copy_env_files
  # copy_env_files may create .env from example — re-apply ports after copy
  write_ports

  print_summary
}

main "$@"
