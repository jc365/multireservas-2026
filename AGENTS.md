# AGENTS.md — fullstack-events-starter

## What Is This Project?

A reusable fullstack starter kit (monorepo) with:
- **Backend:** Express 5 + Prisma + PostgreSQL + JWT auth
- **Frontend:** React + Vite + Tailwind + 6 themes
- **Orchestrator:** Python/FastAPI for event-driven workflows

Forked from a domain-specific app (Castant) and generalized into a domain-agnostic starter. The generic **Item** model is the example domain.

## Stack

- TypeScript 6.0 (`strict: true`, ES2020)
- Backend: ESM (`"type": "module"`), `tsx` runtime, `moduleResolution: node16`
- Frontend: Vite + React, `moduleResolution: bundler`
- Express 5 + cors + dotenv + helmet + rate-limit (CORS via `CORS_ORIGIN`)
- Prisma 7 with PostgreSQL (Docker for dev)
- Logging: pino + pino-pretty + pino-http + nanoid
- Auth: JWT (`jsonwebtoken`) — `JWT_SECRET` mandatory (app throws if missing)
- Password hashing: `bcrypt` via `HashService`
- Testing: Vitest 4 (backend), Vitest + RTL (frontend), Playwright (E2E), pytest (orchestrator)
- Orchestrator: Python 3.10+, FastAPI, uvicorn, httpx

## Repo Structure

```
fullstack-events-starter/
├── backend/                  # Express 5 + Prisma + TypeScript
│   ├── prisma/               # Schema, seed, backups
│   ├── scripts/              # backup-pg.ts, restore-pg.ts
│   └── src/
│       ├── domain/           # Entities, value objects, interfaces
│       ├── application/      # Use cases (commands, queries)
│       └── infrastructure/   # Repositories, API, storage, email
├── frontend/                 # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/       # UI components (Layout, Modals, etc.)
│   │   ├── context/          # UserContext, ThemeContext, ToastContext
│   │   ├── pages/            # Dashboard, Items, ItemDetail, admin/
│   │   └── utils/            # scoring.ts, status.ts
│   └── tests/e2e/            # Playwright E2E tests
├── orchestration/            # Python + FastAPI
│   ├── webhooks/             # FastAPI server (default port 8080)
│   ├── workflows/            # Event-driven workflows
│   ├── utils/                # Email client, backend client
│   └── tests/                # pytest unit + integration tests
├── tests/                    # Backend unit + integration tests (vitest)
├── .agents/skills/           # AI agent skills (versioned)
├── docu/                     # Architecture docs, findings, migrations
└── docs/                     # Diagrams, Cloudflare worker
```

## How to Start

See [README.md](README.md#quick-start) for full setup instructions.

```bash
./setup.sh my-project        # First setup: rename + prompts for 4 ports
./setup.sh --ports           # Change the 4 service ports later
./postsetup.sh               # Install deps, start PostgreSQL, seed
npm run dev:all              # Start all services
```

> No ejecutes `setup.sh` en el repo original del starter sin `--force`
> (ver README § Puertos y setup).

## Key Decisions

- **No SQLite** — PostgreSQL only (Docker for dev, Neon for prod)
- **`prisma db push`** — no migration files; schema syncs directly
- **No `.js` extensions** on import paths (tsx runtime resolves them)
- **IDs are flat strings** with prefixes (`user-...`, `item-...`)
- **Bitácora** — non-blocking audit log (never throws)
- **DEMO_MODE** — allows passwordless login via sidebar for demo purposes
- **Ports** — defaults: backend `3000`, frontend `5173`, orchestrator `8080`, PostgreSQL `5433` (host) / `5432` (container); configurable via `./setup.sh` / `./setup.sh --ports`

## Roles

Three roles: `admin`, `user`, `guest`.

| Role | Access |
|------|--------|
| `admin` | Full access — CRUD all resources, admin panel (bitácora + config) |
| `user` | Standard — create/edit own items, view others |
| `guest` | Read-only — view items only |

Role stored as string in `User.role`. Enforced via `adminMiddleware` (DB lookup) for admin routes.

## Working with AI Assistants

This project includes skills in `.agents/skills/` that provide specialized instructions for common tasks. Load a skill when a task matches its description.

### Included Skills

| Skill | Description |
|-------|-------------|
| `flow-diagram` | Generate Mermaid diagrams from process descriptions |
| `frontend-design` | Design system and HTML mockups for the frontend |
| `security-audit` | Comprehensive security audit checklist |
| `testing-pattern` | Pattern for writing unit tests (Value Objects + Use Cases) |

### If You Use OpenCode

Skills are automatically available. Use the `skill` tool to load one when relevant:

```
skill(name="testing-pattern")
```

Each skill file (`SKILL.md`) contains:
- Purpose and scope
- Step-by-step workflow
- Checklist or templates
- Output format

Custom skills can be added to `.agents/skills/<name>/SKILL.md`.

## Commands

```bash
# Typecheck (no output = ok)
cd backend && npx tsc --noEmit

# All tests
npm test                      # Backend vitest
npm run test:front            # Frontend vitest
npm run test:orch             # Orchestrator pytest
npm run test:all              # Everything

# Dev
npm run dev:all               # DB + Backend + Frontend + Orchestrator
cd backend && npm run dev     # Backend only

# Database
npm run db:up                 # Start PostgreSQL (Docker)
npm run db:push               # Sync schema
npm run db:seed               # Insert demo data
npm run db:backup             # Backup PostgreSQL
npm run db:restore            # Restore backup
npm run db:studio             # Prisma Studio

# Frontend E2E
cd frontend && npx playwright test
```

## API Routes

**Public:** `POST /api/v1/auth/login`
**Protected:** All other routes (JWT via `Authorization: Bearer <token>`)

- `GET /health` → `{ status: 'ok' }`
- `POST /api/v1/auth/login` → `{ email, password, xUserId? }` → `{ token, userId }`
- `GET/POST /api/v1/users`, `GET/DELETE /api/v1/users/:id`, `GET /api/v1/users/me`
- `GET/POST /api/v1/items`, `GET/PUT/DELETE /api/v1/items/:id`
- `GET/PUT/PATCH/DELETE /api/v1/config/:key`, `GET /api/v1/config/category/:category`
- `GET /api/v1/admin/bitacora` (admin only)
- `POST /api/v1/event-queue` (service token)

See `backend/src/infrastructure/api/v1/routes.ts` for full list.

## Orchestrator

Python/FastAPI service for event-driven workflows. Port `8080`.

**Webhooks:**
- `POST /webhook/item.created` → FileProcessorWorkflow
- `POST /webhook/item.reviewed` → NotificationWorkflow
- `POST /webhook/cleanup.daily` → CleanupWorkflow

**Service token auth:** `SEND_TOKEN` in `Authorization: Bearer` header.

See [docu/ORCHESTRATION.md](docu/ORCHESTRATION.md) for full documentation.

## Code Patterns

- **Value Objects:** Private constructor + `static create()` + `static isValid()`. Immutable.
- **Entities:** Private constructor + `static create()`. Auto-generates ID via `genUUID('prefix')`.
- **Repositories:** Prisma-based. `upsert` in `save()`. Private `toDomain()`.
- **Logging:** Use cases import from `requestContext`. Routes import `requestLogger`.
- **Conventions:** 2 spaces, semicolons, single quotes, max 100 chars. `export default` for classes. JSDoc headers on every file.

## Typecheck

Backend and frontend pass `tsc` with 0 errors.

```bash
cd backend && npx tsc --noEmit   # 0 errors
cd frontend && npx tsc -b        # 0 errors
```

## Testing

- Backend: `tests/` at repo root — `tests/unit/` (VO, entities, use cases) + `tests/integration/`
- Frontend: `frontend/src/**/*.test.tsx` (co-located)
- E2E: `frontend/tests/e2e/*.spec.ts`
- Orchestrator: `orchestration/tests/` (pytest, all mocked)
- Pattern: see `.agents/skills/testing-pattern/SKILL.md`

## Security

- `JWT_SECRET` mandatory (app throws if missing)
- `.env` in `.gitignore`
- CORS configurable via `CORS_ORIGIN` (comma-separated)
- Helmet + HSTS in production
- Rate limiting: login 10 req/15min (prod) / 100 (dev), API 1000 req/15min
- Service tokens via `ADMIT_TOKENS` env var

## Additional Documentation

- [README.md](README.md) — Quick start, features, project structure
- [docu/GUIDE.md](docu/GUIDE.md) — Clean Architecture reference
- [docu/ORCHESTRATION.md](docu/ORCHESTRATION.md) — Orchestrator event types, payloads, workflows
- [docu/FINDINGS.md](docu/FINDINGS.md) — Known debt and architectural decisions
- [docu/MIGRATIONS.md](docu/MIGRATIONS.md) — Prisma migration strategy
- [docs/diagrams/](docs/diagrams/) — Flow diagrams
- [docs/cloudflare-worker.js](docs/cloudflare-worker.js) — Keep-alive cron worker

## Versioned AGENTS.md

Before editing, backup to `docu/saves-agents/AGENTS_<YYYYMMDD_HHMMSS>.md`.
Purpose: revert bad changes, track rule evolution.
