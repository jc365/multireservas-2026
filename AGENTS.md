# AGENTS.md — multireservas-2026 (fullstack-events-starter)

## What Is This Project?

A reusable fullstack starter kit (monorepo) with:
- **Backend:** Express 5 + Prisma + PostgreSQL + JWT auth
- **Frontend:** React + Vite + Tailwind + 6 themes
- **Orchestrator:** Python/FastAPI for event-driven workflows

Forked from a domain-specific app (Castant) and generalized into a domain-agnostic starter. The generic **Item** model is the example domain. Project name: `multireservas-2026`.

## Stack

- TypeScript (backend 6.x `strict: true` ES2020; frontend 5.6 `strict: true`)
- Backend: ESM (`"type": "module"`), `tsx` runtime, `moduleResolution: Bundler` (+ `allowJs`, `checkJs: false`)
- Frontend: Vite 6 + React 18, `moduleResolution: bundler`
- Express 5 + cors + dotenv + helmet + rate-limit (CORS via `CORS_ORIGIN`)
- Prisma 7 with PostgreSQL 16 (Docker for dev, port 5433 host / 5432 container)
- Logging: pino + pino-pretty + pino-http + nanoid
- Auth: JWT (`jsonwebtoken`) — `JWT_SECRET` mandatory (module throws if missing)
- Password hashing: `bcrypt` via `HashService` (SALT_ROUNDS=10)
- Storage: Cloudflare R2 (S3 SDK) with local fallback (`backend/uploads/files/`)
- Email: multi-provider (console | smtp | resend)
- Testing: Vitest 4 (root/backend + frontend), Playwright (E2E), pytest (orchestrator)
- Orchestrator: Python 3.10+, FastAPI, uvicorn, httpx (port 8080)

## Repo Structure

```
multireservas-2026/
├── backend/                  # Express 5 + Prisma + TypeScript
│   ├── prisma/               # schema.prisma, seed.ts, prisma.config.ts
│   ├── scripts/              # backup-pg.ts, restore-pg.ts
│   ├── uploads/              # local file fallback (R2 unconfigured)
│   └── src/
│       ├── index.ts          # App entry (CORS, helmet, pino-http, mounts /api/v1)
│       ├── domain/           # entities/, value-objects/, utils/genUUID.ts
│       ├── application/      # dtos/, interfaces/, use-cases/
│       ├── generated/prisma/ # Prisma 7 generated client (do not edit)
│       └── infrastructure/   # api/, config/, logging/, middleware/,
│                             # persistence/, security/, storage/, webhooks/
├── frontend/                 # React + Vite + Tailwind
│   ├── src/
│   │   ├── api/client.ts     # Axios + auth header + GET TTL-cache
│   │   ├── components/       # Layout, LoginForm, modals, AdminSubNav
│   │   ├── context/          # User, Theme, Toast, Config, UserCache
│   │   ├── hooks/            # useFileUrls.ts
│   │   ├── pages/            # Dashboard, Items, CreateItem, ItemDetail, admin/
│   │   ├── utils/            # logger.ts, roleConfig.ts
│   │   └── test/setup.ts     # vitest setup (jest-dom, matchMedia mock)
│   ├── design/               # DESIGN.md + HTML mockups
│   └── tests/e2e/            # Playwright specs + helpers/
├── orchestration/            # Python + FastAPI (uses venv/)
│   ├── webhooks/server.py    # FastAPI app (port 8080)
│   ├── workflows/            # base, file_processor, cleanup, notifications,
│   │                         # r2_monitor, test_email
│   ├── utils/                # backend_client, email_client, config, logger
│   ├── event_poller.py       # polls GET /events/pending every 30s
│   └── tests/                # pytest (all mocked)
├── tests/                    # ROOT vitest suite (not backend/tests)
│   ├── unit/                 # domain + use-case tests
│   ├── integration/api/v1/   # supertest API tests
│   ├── REST Client/          # *.http files
│   └── globalSetup.ts        # prisma db push --force-reset → _test DB
├── scripts/run-all-tests.sh  # 4-suite runner (npm run test:all)
├── .agents/skills/           # AI agent skills (versioned)
├── docu/                     # GUIDE, FINDINGS, ORCHESTRATION, MIGRATIONS
│   └── saves-agents/         # AGENTS.md versioned backups
└── docs/                     # Diagrams, Cloudflare worker
```

## How to Start

See [README.md](README.md#quick-start) for full setup.

```bash
./setup.sh my-project        # Rename project (idempotent, --dry-run supported)
./postsetup.sh               # Install deps, start PostgreSQL, seed
npm run dev:all              # DB + Backend + Frontend + Orchestrator
```

## Key Decisions

- **No SQLite** — PostgreSQL only (Docker for dev, Neon for prod)
- **`prisma db push`** — no migration files; schema is source of truth (see docu/MIGRATIONS.md for baselining)
- **No `.js` extensions** on relative imports (tsx runtime resolves them; causes accepted tsc debt)
- **IDs:** entities use `genUUID('usr'|'item')` → `prefix-nanoid`; Prisma defaults uuid/cuid for Bitacora/Config/EventQueue
- **Bitácora** — non-blocking audit log (`BitacoraService.log()` never throws)
- **EventQueue** — non-blocking event dispatch (`webhookClient.dispatchEvent()` never throws); orchestrator polls it
- **DEMO_MODE** (backend) + **VITE_DEMO_MODE** (frontend) — passwordless login via `xUserId` role switch in sidebar
- **Port 5433** (host) / 5432 (container) to avoid conflicts; backend 3000, frontend 5173, orchestrator 8080
- **Service tokens:** backend `ADMIT_TOKENS` (comma-separated) matches orchestrator `SEND_TOKEN` — bypasses JWT, injects `{ id: 'service', role: 'service' }`

## Roles

Three roles: `admin`, `user`, `guest` (plus pseudo-role `service` for tokens).

| Role | Access |
|------|--------|
| `admin` | Full access — CRUD all, admin panel (bitácora + config) |
| `user` | Standard — create/edit own items, view others |
| `guest` | Read-only — view items only |
| `service` | Token-only — event queue endpoints |

Role stored as plain string in `User.role`. JWT contains only `userId` (role is **not** in the token). Enforced via `adminMiddleware` (DB `findById` lookup) — used on `GET /admin/bitacora` and the `/admin` frontend guard (`isAdmin()` from `GET /users/:id`).

## Working with AI Assistants

Skills live in `.agents/skills/`. Load a skill when the task matches its description.

| Skill | Description |
|-------|-------------|
| `flow-diagram` | Generate Mermaid diagrams from process descriptions |
| `frontend-design` | Design system and HTML mockups (see `frontend/design/DESIGN.md`) |
| `security-audit` | Comprehensive security audit checklist |
| `testing-pattern` | Pattern for unit tests (Value Objects + Use Cases) |

OpenCode loads these automatically via the `skill` tool:

```
skill(name="testing-pattern")
```

Each skill: `SKILL.md` with purpose, workflow, checklist, output format; optional `templates/` and `examples/`. Custom skills → `.agents/skills/<name>/SKILL.md` (guide for creating: `.agents/skills/guia-skill.md`).

## Commands

```bash
# Typecheck
cd backend && npx tsc --noEmit 2>&1 | wc -l   # baseline ~146 (accepted debt)
cd frontend && npx tsc -b                       # 0 errors expected

# Tests (root vitest runs tests/ + backend/src/**/*.test.ts)
npm test                      # Backend/unit+integration vitest (serial, force-resets _test DB)
npm run test:front            # Frontend vitest (co-located *.test.tsx)
npm run test:orch             # Orchestrator pytest (venv, all mocked)
npm run test:integration      # Only tests/integration
npm run test:all              # All 4 suites via scripts/run-all-tests.sh

# Dev
npm run dev:all               # DB + Backend + Frontend + Orchestrator
npm run dev:back              # Backend only
npm run dev:orches            # Orchestrator only

# Database
npm run db:up                 # Start PostgreSQL (Docker)
npm run db:down               # Stop PostgreSQL
npm run db:push               # Sync schema (cd backend)
npm run db:seed               # Insert demo data
npm run db:backup             # Backup PostgreSQL
npm run db:restore            # Restore backup
npm run db:studio             # Prisma Studio

# Frontend E2E
cd frontend && npx playwright test   # webServer starts VITE_DEMO_MODE=true dev
```

## API Routes

Mounted at `/api/v1` (`backend/src/infrastructure/api/v1/routes.ts`). Public route first; then `router.use(authMiddleware)` + `apiLimiter` protect everything below.

**Public:**
- `GET /health` → `{ status: 'ok' }` (root app, excluded from autoLogging)
- `POST /api/v1/auth/login` (loginLimiter) → `{ email, password, xUserId? }` → `{ token, userId }`

**Protected (JWT or ADMIT_TOKENS service token):**

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/api/v1/users` | list / create (201) |
| GET | `/api/v1/users/me` | from `req.user.id` |
| GET/DELETE | `/api/v1/users/:id` | 404 / 204 |
| GET/POST | `/api/v1/items` | POST requires `req.user.id` |
| GET/DELETE | `/api/v1/items/:id` | |
| PATCH | `/api/v1/items/:id` | partial update |
| POST | `/api/v1/items/:id/file` | multer memory, field `file` |
| GET | `/api/v1/files/:key/url` | presigned R2 (7200s) or `/uploads/{key}` |
| GET | `/api/v1/config` | all |
| GET | `/api/v1/config/category/:category` | by category |
| GET/PUT/PATCH/DELETE | `/api/v1/config/:key` | upsert / merge / delete |
| GET | `/api/v1/events/pending?limit≤50` | EventQueue poll (default 10) |
| PATCH | `/api/v1/events/:id/complete` | mark done + processedAt |
| PATCH | `/api/v1/events/:id/fail` | attempts+1; failed at maxAttempts=3 else pending |
| GET | `/api/v1/admin/bitacora` | **adminMiddleware**; page/limit≤100, filters userId, action (comma), entityType, since, until |

There is **no** `POST /event-queue` — the orchestrator polls `GET /events/pending`. `v2/routes.ts` is an empty unmounted stub.

**Rate limits:** login 10/15min (prod) or 100 (dev); general API 1000/15min.

## Orchestrator

Python/FastAPI on port `8080`. Generic receiver: `POST /webhook/{event_type}` queues `workflow.safe_execute` via BackgroundTasks.

**Registered workflows:**

| Event | Workflow | Purpose |
|-------|----------|---------|
| `item.created` | FileProcessorWorkflow | ffprobe/ffmpeg metadata + thumbnail; PATCH item |
| `item.reviewed` | NotificationWorkflow | notification email |
| `cleanup.daily` | CleanupWorkflow | delete old files/thumbnails (CLEANUP_MAX_AGE_DAYS=7) |
| `r2.monitor` | R2MonitorWorkflow | bucket size alert (manual `GET /webhook/r2.monitor`) |
| `test.email` | TestEmailWorkflow | send test email |

**Also:** `GET /health`, `GET /workflows`. Lifespan waits for backend health, starts config reload + `EventPoller` (30s poll → complete/fail PATCH).

**Service token auth:** `SEND_TOKEN` (orchestration/.env) must be listed in backend `ADMIT_TOKENS`.

See [docu/ORCHESTRATION.md](docu/ORCHESTRATION.md).

## Code Patterns

- **Value Objects:** private constructor + `static create()` (throws) + `static isValid()` + `getValue()`/`equals()`. Immutable.
- **Entities:** private constructor + `static create()` + getters; optional `reconstitute()` / `withUpdates()` (returns new instance). ID via `genUUID(prefix)`.
- **Use cases:** constructor-injected repos; single `async execute()`; `logger.info({..}, 'Name: starting')`; mutations call `bitacoraService.log()`.
- **Repositories:** Prisma-based; `save()` uses `upsert`; private `toDomain()`; implements `I*Repository` interface.
- **Middleware:** `authMiddleware` (JWT/`ADMIT_TOKENS`) then per-route `adminMiddleware` (DB role check).
- **Logging:** use cases & routes import default `requestLogger`/`logger` from `requestContext` (AsyncLocalStorage requestId); infrastructure imports pino `logger` from `logging/logger`.
- **Events:** `dispatchEvent()` → EventQueue row, never throws (same non-blocking philosophy as bitácora).
- **Frontend components:** `export default function X`, typed props interface, controlled modals (`isOpen`, `role="dialog"`, Escape close).
- **Frontend contexts:** named exports `XxxProvider` + `useXxx()` (throws outside provider).
- **Frontend API:** axios instance with Bearer injection + GET TTL cache (`/items` 5min, `/users` 10min, `/bitacora` 30s, `/files` 2min, default 2min) and mutation invalidation.
- **Themes:** 6 ids (`light|dark|ocean|forest|sunset|night`) → CSS class on `<html>` + CSS vars in `index.css`; register in `THEME_CONFIG` (`ThemeContext.tsx`) + add class block.
- **Conventions:** 2 spaces, semicolons, single quotes; PascalCase files for classes/components; camelCase for hooks/utils; interfaces prefixed `I`; private fields `_underscored`; JSDoc `@file`/`@module` headers (backend nearly always; frontend on newer files).
- **Export style (actual):** mixed — domain entities/VOs, infra services, item use cases → `export default`; user/auth/config/bitacora use cases, middleware, contexts, utils → named exports. Routers → `export default router`.

## Typecheck

Backend tsc has pre-existing errors (~146). Accepted debt — `tsx` runtime resolves them. See [docu/FINDINGS.md](docu/FINDINGS.md).

```bash
cd backend && npx tsc --noEmit 2>&1 | wc -l
# Baseline: ~146. Breakdown: ~120×TS2835 (missing .js ext), ~19×TS7006 (implicit any),
# ~5×TS2834, 1×TS2349 (pinoHttp). Goal: reduce over time (Phases A/B/C in FINDINGS).
cd frontend && npx tsc -b   # expect 0
```

## Testing

- **Root vitest** (`vitest.config.ts`): includes `tests/**/*.test.ts` + `backend/src/**/*.test.ts`; `fileParallelism: false`; alias `@` → `./backend/src`; `globalSetup` runs `prisma db push --force-reset` into `multireservas-2026_test` (port 5433); sets `JWT_SECRET=test-secret`.
- Unit: `tests/unit/domain/{entities,value-objects}/`, `tests/unit/application/use-cases/`
- Integration: `tests/integration/api/v1/` (supertest)
- Frontend: co-located `frontend/src/**/*.test.tsx` (App, Layout, LoginForm, UserContext); setup in `src/test/setup.ts`
- E2E: `frontend/tests/e2e/*.spec.ts` + `helpers/{auth,wait}.ts` — `loginAs(page, role)` uses demo mode
- Orchestrator: `orchestration/tests/` (pytest, all mocked)
- **Known debt:** many root unit/integration tests still target the old Castant domain (Casting, Submission, Round, Director) that no longer exists in `backend/src` — only User/Email/FullName/CreateUserUseCase/users tests match current code.
- Pattern: `.agents/skills/testing-pattern/SKILL.md`

## Security

- `JWT_SECRET` mandatory (auth module throws at load)
- `.env` in `.gitignore`; `setup.sh` copies `.env.example` → `.env`
- CORS via `CORS_ORIGIN` (comma-separated; default `http://localhost:5173`)
- Helmet + HSTS in production
- Rate limiting: login 10/15min (prod) / 100 (dev); API 1000/15min
- Service tokens via `ADMIT_TOKENS` (backend) ↔ `SEND_TOKEN` (orchestrator)
- Passwords: bcrypt cost 10; demo login gated by `DEMO_MODE=true`
- R2 credentials via env; local disk fallback when unconfigured

## Environment Variables

**Backend:** `DATABASE_URL`*, `JWT_SECRET`*, `PORT` (3000), `NODE_ENV`, `CORS_ORIGIN`, `ADMIT_TOKENS`, `DEMO_MODE`, `LOG_LEVEL`, `CLOUDFLARE_R2_{ACCOUNT_ID,ACCESS_KEY_ID,SECRET_ACCESS_KEY,BUCKET,TARGET_FOLDER}`, `DB_CONTAINER`/`DB_USER`/`DB_NAME` (backup/restore)

**Frontend:** `VITE_API_URL` (default `/api/v1`), `VITE_DEMO_MODE`

**Orchestrator:** `BACKEND_URL`, `SEND_TOKEN`, `ORCHESTRATOR_HOST`/`ORCHESTRATOR_PORT`, `ORCH_RELOAD`, `UPLOADS_DIR`, `CLEANUP_MAX_AGE_DAYS`, `LOG_LEVEL`, `EMAIL_PROVIDER`/`EMAIL_FROM`/`EMAIL_FROM_NAME`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, `RESEND_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_R2_BUCKET`/`CLOUDFLARE_API_TOKEN`

\* = mandatory

## Additional Documentation

- [README.md](README.md) — Quick start, features, project structure
- [docu/GUIDE.md](docu/GUIDE.md) — Clean Architecture reference
- [docu/ORCHESTRATION.md](docu/ORCHESTRATION.md) — Event types, payloads, workflows
- [docu/FINDINGS.md](docu/FINDINGS.md) — Known debt, decisions, typecheck baseline
- [docu/MIGRATIONS.md](docu/MIGRATIONS.md) — Prisma `db push` + baselining strategy
- [docs/diagrams/](docs/diagrams/) — Flow diagrams
- [docs/cloudflare-worker.js](docs/cloudflare-worker.js) — Keep-alive cron worker
- [frontend/design/DESIGN.md](frontend/design/DESIGN.md) — Design system

## Versioned AGENTS.md

Before editing, backup to `docu/saves-agents/AGENTS_<YYYYMMDD_HHMMSS>.md`.
Purpose: revert bad changes, track rule evolution.
