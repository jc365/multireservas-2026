# fullstack-events-starter

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg)](https://www.python.org/)

Reusable fullstack starter kit with Node/Express backend, React frontend, and Python orchestrator for event-driven workflows.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Express 5 + TypeScript 6.0 + Prisma 7 + PostgreSQL |
| Frontend | React 18 + Vite + Tailwind CSS + 6 themes |
| Orchestrator | Python/FastAPI + uvicorn + httpx |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Database | PostgreSQL 15+ (Docker for dev, Neon for prod) |
| Storage | Cloudflare R2 (S3-compatible) with local fallback |
| Email | Multi-provider (console, SMTP, Resend) |
| Testing | Vitest 4 (backend/frontend) + Playwright (E2E) + pytest (orchestrator) |

## Quick Start

```bash
# 1. Clone and rename
git clone https://github.com/jc365/fullstack-events-starter.git my-project
cd my-project
./setup.sh my-project    # first-time setup: asks for 4 service ports (defaults: 3000/5173/8080/5433)

# 2. Install deps, start PostgreSQL, seed
./postsetup.sh

# 3. Start all services
npm run dev:all
```

> **Nota:** Si has hecho fork del starter, sustituye `jc365` por tu usuario de GitHub.

> Los `.env` se crean automáticamente con valores placeholder funcionales para desarrollo local. Antes de desplegar a producción, edítalos (especialmente `JWT_SECRET`).

> Uses `prisma db push` (no migration files). See [docu/MIGRATIONS.md](docu/MIGRATIONS.md) for versioned migrations.

### Puertos y setup

`setup.sh` pregunta 4 puertos en la primera configuración (backend,
frontend, orchestrator, PostgreSQL) y los escribe literalmente en todos
los configs.

| Comando | Qué hace |
|---------|----------|
| `./setup.sh mi-proyecto` | Primera configuración: renombra el proyecto y pregunta los 4 puertos |
| `./setup.sh --ports` | Cambiar los puertos después (sin renombrar) |
| `./setup.sh mi-proyecto --force` | Ejecutar en el repo original del starter (solo para desarrollo del starter) |

> ⚠️ **No ejecutes `setup.sh` en el repo del starter original**
> (`fullstack-events-starter`). Está pensado para clones derivados;
> sin `--force` el script se niega a ejecutarse ahí.

Variables del orquestador en `orchestration/.env`:

- `ORCHESTRATOR_PORT` — puerto del servidor uvicorn (default `8080`)
- `ORCH_RELOAD` — hot-reload de uvicorn en dev (default `true`)

### Useful Commands

| Command | Description |
|---------|-------------|
| `./setup.sh --ports` | Cambiar los 4 puertos de servicio |
| `./postsetup.sh` | Install deps, start PostgreSQL, seed |
| `npm run dev:all` | Start DB + Backend + Frontend + Orchestrator |
| `npm run db:up` | Start PostgreSQL (Docker) |
| `npm run db:push` | Sync schema |
| `npm run db:seed` | Insert demo data |
| `npm run db:backup` | Backup PostgreSQL |
| `npm run db:restore` | Restore backup |
| `npm run db:studio` | Open Prisma Studio |

> Default ports: backend `3000`, frontend `5173`, orchestrator `8080`, PostgreSQL `5433` (host) / `5432` (container). Cambia `./setup.sh --ports`.

## Project Structure

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
│   └── tests/                # pytest tests
├── tests/                    # Backend unit + integration tests (vitest)
├── .agents/skills/           # AI agent skills (versioned)
├── docu/                     # Architecture docs, findings, migrations
└── docs/                     # Diagrams, Cloudflare worker
```

## What's Included

| Feature | Description |
|---------|-------------|
| REST API | Express 5 with full CRUD, validation, auth, rate limiting |
| Database | Prisma 7 + PostgreSQL, schema-first with `db push` |
| Auth | JWT tokens with role-based access (admin, user, guest) |
| Dynamic Config | Runtime config via API, no restart needed |
| Audit Log | Non-blocking bitácora for all mutations |
| Admin Panel | Bitácora viewer + config editor (admin role only) |
| Themes | 6 built-in themes via Tailwind CSS custom properties |
| Workflows | FastAPI event-driven with webhook triggers |
| Storage | Cloudflare R2 with local fallback |
| Email | Console (dev), SMTP, Resend providers |
| AI Skills | Reusable `.agents/skills/` for common tasks |

## Admin Panel

The admin panel (admin role only) includes:

- **Bitácora** — Paginated audit log with filters (action, entity type, dates, user)
- **Config** — Runtime configuration editor organized by category

Access via sidebar when logged in as admin.

## What to Customize

The starter uses a generic **Item** model as the example domain. To adapt:

1. Define entities in `backend/src/domain/entities/`
2. Create value objects in `backend/src/domain/value-objects/`
3. Update the Prisma schema in `backend/prisma/schema.prisma`
4. Implement use cases in `backend/src/application/use-cases/`
5. Add API routes in `backend/src/infrastructure/api/v1/routes.ts`
6. Build frontend pages in `frontend/src/pages/`

## AI Agent Skills

Skills in `.agents/skills/` provide specialized instructions for common tasks:

| Skill | Purpose |
|-------|---------|
| `flow-diagram` | Generate Mermaid diagrams from process descriptions |
| `frontend-design` | Design system and HTML mockups |
| `security-audit` | Comprehensive security audit checklist |
| `testing-pattern` | Pattern for writing unit tests (VO + Use Cases) |

If using OpenCode, skills are automatically available via the `skill` tool.

## Requirements

- Node.js 20+
- Python 3.10+
- PostgreSQL 15+ (or Docker)
- Docker (optional, for local DB)

## Documentation

- [AGENTS.md](AGENTS.md) — Full project conventions, patterns, and commands
- [docu/GUIDE.md](docu/GUIDE.md) — Clean Architecture reference
- [docu/ORCHESTRATION.md](docu/ORCHESTRATION.md) — Orchestrator event types, payloads, workflows
- [docu/FINDINGS.md](docu/FINDINGS.md) — Known debt and decisions
- [docu/MIGRATIONS.md](docu/MIGRATIONS.md) — Prisma migration strategy
- [docs/diagrams/](docs/diagrams/) — Flow diagrams

## License

MIT — see [LICENSE](LICENSE).
