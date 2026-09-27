# Hallazgos y deuda técnica

Este documento registra **deuda viva**, **decisiones arquitectónicas** y
**limitaciones conocidas**. El histórico de cambios ya verificados vive en
`git log`, no aquí.

## Deuda viva

### Backend

- **`adminMiddleware` con DB lookup por request.** Cada request a
  `/admin/*` y a las escrituras de `/config/:key` ejecuta `findById` +
  check `role === 'admin'`. Para alta frecuencia, considerar caché de
  roles.
- **`PUT /config/:key` devuelve 201, `PATCH` 200, `DELETE` 204.**
  Códigos pre-existentes (upsert vs update). Unificarlos sería un
  breaking change para clientes existentes.

### Frontend

- **`ConfigPage` no valida JSON en la textarea.** Si el usuario pega
  JSON inválido, el backend rechaza y la UI no muestra un error claro.
- **`SubmitFileModal` — pestaña URL deshabilitada** (`allowUrlInput=false`).
  `PATCH /items/:id` solo acepta `title`/`description`/`status` (sin
  `fileUrl`); la subida de fichero es el único camino desde la UI.
  Ver `TODO(3.3c)` en `SubmitFileModal.tsx`.

### Seguridad

- **Secretos placeholder en `.env.example`** (`JWT_SECRET`,
  `ADMIT_TOKENS`, `SEND_TOKEN`). Funcionan en local, pero es
  **obligatorio** cambiarlos antes de desplegar a producción.
  Generar secreto: `openssl rand -hex 32`.

## F2 / SF2 — Modelo de datos MultiReservas (2026-09-26)

Rama `feature/f2-modelo-datos`. Schema: `backend/prisma/schema.prisma`.
Verificado: `prisma validate` + `format` + `generate` + `db push` OK,
`npm test` 35/35 (misma línea base), seed OK, backend `tsc --noEmit` 0.
Solo se tocó el schema (y esta nota).

### Hecho en SF2

- **Nuevos modelos:** `Tenant`, `Employee`, `Service`, `Client`,
  `Reservation` (+ enum `ReservationStatus`, + tabla M2M
  `_EmployeeToService`).
- **Ampliados:** `User.tenantId String?` (FK → Tenant, índice) +
  back-relations `employee?`/`client?`; `Bitacora.tenantId String?`
  (índice, sin FK).
- **Intactos:** `Item` (hasta F3), `Config`, `EventQueue`, relaciones
  `User→Item/Bitacora`.

### Decisiones (punto ambiguo → opción elegida)

- **IDs:** `String @id` app-side con prefijo (`genUUID`: `ten/emp/svc/
  cli/res`), igual que `User`/`Item` del starter. `Bitacora/Config/
  EventQueue` conservan `uuid()/cuid()`.
- **`User.role`: String en SF2**, enum en **F3**. Un enum MR puro
  (`owner|employee|admin|client`) rompe sin tocar código de app:
  `seed.ts` (`role:'user'/'guest'`), `UserRole` + default `'user'` en
  `User.create`, demo login (`xUserId`) y `UserContext`/tests frontend.
  La migración atómica (schema + entity + seed + demo + frontend) va
  en F3. Los valores F0 quedan en el comentario del schema.
- **`Reservation.status`: enum Prisma** `pending|confirmed|cancelled|
  completed|no_show` — modelo nuevo, cero código que romper, CHECK en
  BD para la máquina de estados.
- **`Employee` ↔ `Service`: M2M implícito** (`services Service[]`) +
  `offersAllServices Boolean`. Elegido sobre `String[]` de IDs (F0
  literal) por integridad referencial y queries "¿quién ofrece este
  servicio?"; sobre join explícito por no haber metadata que portar.
  La semántica F0 (flag + lista concreta) se conserva.
- **`slotDuration` se queda en `settings` JSON** (F0 #9); no se
  duplica como columna. `currency`/`timezone` sí son columnas.
- **`Client.email` y `User.email`** → ver SF2.1 (abajo): Client
  opcional + único por tenant; User único global.
- **FK única en `Employee.userId` / `Client.userId` (`@unique`,
  `onDelete: SetNull`)** → User; no FK inversa en User (F0 #7).
- **`Reservation.date DateTime @db.Date`** (día calendario sin tz) y
  `startTimeUTC/endTimeUTC @db.Timestamptz` (instantes UTC reales);
  `timezone` (IANA) como columna snapshot.
- **`price Decimal? @db.Decimal(10, 2)`** — no `Float`. OJO: Prisma lo
  serializa como **string** en JSON; el formateo es cosa de F3.
- **`Bitacora.tenantId` sin FK** (columna + índice): la bitácora es
  historial y no debe bloquear/borrarse con el tenant. Sigue el
  patrón `entityType/entityId`.
- **Hijos de Tenant con `onDelete: Restrict`** → no se puede borrar
  un tenant con datos; se usa `isActive` (soft delete).
- **`activeKey String?` + `@@unique([activeKey])`** (F0 #8): se rellena
  con `{employeeId}-{date}-{startTime}` en activas (`pending|
  confirmed`), `null` en el resto. El índice único existe en BD.
- **Extras en `Tenant`:** `name String` y `slug String? @unique`
  (URLs públicas de reserva en F4+).
- **`Item` se mantiene hasta F3** (20 archivos frontend + seed +
  rutas lo usan); `Config` y `EventQueue` se quedan (F0).

### F2 / SF2.1 — Ajustes finales (2026-09-26)

- **`Tenant.settings/schedules/holidays` con `@default`**
  (`"{}"` / `"[]"` / `"[]"`). Prisma 7 acepta la sintaxis literal en
  `Json` (no hizo falta `dbgenerated`). Semántica: **siempre hay
  objeto/array, aunque vacío** — un `null` no aporta. Diferencia con
  `Employee.customSchedule/customHolidays` que sí son `Json?`:
  `null` (= sigue el horario del tenant) **no** es lo mismo que `[]`.
- **`Client.email` opcional + `@@unique([tenantId, email])`**
  (sustituye al índice simple). El email identifica al cliente
  **dentro** del tenant (dedup); un cliente anónimo puede no
  dejarlo. PostgreSQL permite N NULLs en unique → conviven varios
  clientes sin email. (BD local vacía al aplicar; 0 filas en riesgo.)
- **`User.email` único global (sin cambios).** Cada persona tiene
  **una cuenta de plataforma**; si trabaja en varios tenants, varios
  `Employee` apuntan al mismo `User`. Si aparece la necesidad de
  roles/membresías por tenant, evolucionar a modelo `Membership`.

### F2 / SF3a — Identidad de auth: enum UserRole + seed (2026-09-26)

Backend-only (el frontend se adapta en SF3b). Verificado:
`validate/format/generate` OK, `db push` (dev+test) OK, `db:seed` → 4
usuarios, `npm test` **63/63** (35 previos + 28 nuevos), `tsc` 0,
login manual por curl (4 roles + password + rechazo de xUserId
inválido).

**Cambios:**

- `schema.prisma`: `enum UserRole { owner, employee, admin, client }`
  y `User.role UserRole @default(client)`.
- `domain/entities/User.ts`: `UserRole` MR (sustituye a
  `admin|user|guest`), default `'client'`.
- `PrismaUserRepository.toDomain` tipa `role: UserRole` (sin cast).
- `LoginUseCase.DEMO_USERS`: claves `owner|employee|admin|client` +
  **aliases legacy** `user→employee@demo.com`,
  `guest→client@demo.com` (el switch demo del frontend envía
  `admin|user|guest`; eliminar aliases en SF3b).
- `prisma/seed.ts`: 4 usuarios, uno por rol
  (`owner|employee|admin|client@demo.com`), upsert con
  `update: { name, role }` (seed autoritativo); items demo creados
  por admin y employee.
- Tests nuevos: `tests/unit/domain/entities/User.test.ts` (default +
  4 roles), `tests/unit/application/use-cases/auth/LoginUseCase.test.ts`
  (4 demo + aliases + inválido + DEMO_MODE off + password),
  `tests/integration/api/v1/auth.test.ts` (login por rol → token →
  `GET /users/me` con rol correcto). `vitest.config.ts` fija
  `DEMO_MODE=true` (mismo patrón que `JWT_SECRET`).

**Decisiones:**

- **Default `client`** (schema + entity): privilegio mínimo; el API
  `POST /users` no acepta `role` (sin escalada de privilegios);
  coherente con F0 #7/#10. Descartados: `employee` (¿cuenta nueva =
  staff?) y *sin default* (obligaría a aceptar `role` en el DTO).
- **JWT sin cambios** (solo `userId`): el rol se verifica vía
  `GET /users/me`; los claims `tenantId`/`role` (F0 #5) llegan con el
  MW de scope tenant.
- **Pseudo-rol `'service'`** (ADMIT_TOKENS) queda **fuera** del enum:
  es un token de servicio, no una fila en BD.
- **Migración de BD (importante):** el cambio `text → enum` hace que
  Prisma **dropee y recree la columna** (`--accept-data-loss`
  requerido) — los valores existentes **se pierden y quedan en el
  default**: `admin@demo.com` salió como `client` y hubo que
  restaurarlo a `admin`. Pre-migración: 3 usuarios demo obsoletos
  (`user1|user2|guest@demo.com`) borrados de dev (0 bitácora;
  `item-demo-3` cayó por cascade y lo recreó el seed) y test DB
  re-mapeada `'user'→'client'`. **Verificar siempre los roles tras
  un push que cambie el tipo de `role`.**

**Deuda SF3b / posterior:**

- ~~Frontend aún habla roles string (`UserContext`, `DEMO_USER_MAP`/
  select demo, tests con roles viejos)~~ — cerrado por **SF3b**.
- ~~Eliminar aliases legacy de `DEMO_USERS`.~~ — cerrado por **SF3b**.
- Usuarios demo con `tenantId = NULL` (plataforma) hasta que existan
  tenants y el MW de scope (F4).

### F2 / SF3b — Frontend a roles MR + fin de aliases (2026-09-27)

Frontend + retiro de aliases en `LoginUseCase`. Comportamiento de UI
**idéntico al pre-SF3b** (decisión: la tabla de permisos centraliza lo
que ya ocurría). Verificado: `npm run test:front` **32/32** (17 previos
+ 15 nuevos/actualizados), `npm test` **63/63**, `tsc` front **0** /
back **0**, prueba manual — curl: 4 roles MR → 200 con userIds
distintos, aliases `user|guest` → **401**; Playwright sobre dev:
select `owner|employee|admin` sin opciones legacy, cabecera
"Owner/Employee/Admin Demo" al cambiar de rol, link
`/admin/bitacora` visible **solo** con rol admin.

**Cambios frontend:**

- `utils/roleConfig.ts`: `type Role = 'owner'|'employee'|'admin'|'client'`
  y `type Permission`; badges MR (owner 👑 ámbar, admin 🛡 rojo,
  employee 💼 azul, client 👤 neutro) que sustituyen a
  `admin|user|guest`; `ROLE_PERMISSIONS` + `can(role, perm)`.
  Antes era código huérfano (sin imports en todo `frontend/src`).
- `context/UserContext.tsx`: uniones de rol → `Role` (importado de
  `roleConfig`), fallback `|| 'guest'` → `|| 'client'`.
- `components/Layout.tsx`: `DEMO_USER_MAP` → 4 emails demo MR
  (`owner|employee|admin|client@demo.com`); select demo →
  `Owner | Employee | Admin`. **`client` queda fuera del select**
  (no inicia sesión en v1, decisión F0); el map sí lo conoce para
  no forzar el rol equivocado si un client se autentica.
- `pages/ItemDetail.tsx`: `canEdit = can(user.role, 'editItems')`
  (mismo resultado que `isAdmin()`, ahora centralizado).
- `App.tsx`: `AdminGuard` ya usaba `isAdmin()` → **solo admin**, sin
  cambios (el owner no ve el panel hasta F5).
- E2E: `tests/e2e/helpers/auth.ts` unión `'owner'|'employee'|'admin'`;
  `critical-flows.spec.ts` prueba login `employee`.

**Tests:**

- Nuevo `frontend/src/utils/roleConfig.test.ts`: badges de los 4
  roles MR, ausencia de claves legacy, permisos por rol, fallback de
  `getRoleBadge` y `can()` con rol desconocido → false.
- `UserContext.test.tsx`: +testid `is-admin`, +caso `owner` (no es
  admin), rol `user` → `employee`.
- `Layout.test.tsx`: mock de `useUser` con usuario mutable; select con
  valores MR exactos; cambio de rol dispara `login({ xUserId })`; link
  admin visible solo en admin (4 casos); `vi.stubEnv('VITE_DEMO_MODE')`.
- Backend (solo tests): aliases `user|guest` ahora esperan **401** en
  `tests/integration/.../auth.test.ts` y se rechazan en unit
  (`LoginUseCase.test.ts`); total sigue en 63/63.

**Decisiones:**

- **Permisos por rol** (`ROLE_PERMISSIONS`): solo `admin` tiene
  `editItems` y `adminPanel`; todos `viewItems`. **Comportamiento
  idéntico al anterior** (elegido explícitamente); owner/employee
  ganarán permisos con la zona owner (F5) y la agenda (F6).
- **Aliases `user`/`guest` eliminados** del backend: un cliente viejo
  que aún los envíe recibe 401 (el switch demo del frontend se
  actualizó en el mismo cambio, sin ventana de rotura).
- `getRoleBadge` mantiene el fallback genérico (rol desconocido →
  badge neutro con label en mayúsculas) por robustez.

### F2 / SF4 — JWT con userId + tenantId + role (2026-09-27)

Backend-only. Verificado: `npm test` **82/82** (63 previos + 19
nuevos), `tsc` backend **0**, `npm run test:front` **32/32** (sin
cambios), login manual por curl → 4 roles con payload
`{ userId, tenantId: null, role }`.

**Cambios:**

- `infrastructure/middleware/auth.ts`:
  - `generateToken(userId, tenantId: string | null, role: UserRole)` —
    los 3 parámetros **requeridos**: imposible emitir un token con el
    formato viejo por olvido. Payload `{ userId, tenantId, role }` +
    `iat`/`exp` (24h). Exporta `JwtTokenPayload`.
  - `authMiddleware` valida la forma del payload (`isValidPayload`):
    `userId`/`role` string y `tenantId` string|null; si falta algo →
    **401 Invalid token**. Payload válido →
    `req.user = { id, tenantId, role }`. Service tokens →
    `{ id: 'service', role: 'service', tenantId: null }`.
- `domain/entities/User.ts`: **gap detectado** — el schema tenía
  `tenantId` pero la entidad no → campo `_tenantId` (`string | null`,
  default `null`) + getter + 6º parámetro opcional en `create`
  (retrocompatible con las 12 llamadas existentes).
- `PrismaUserRepository.toDomain` pasa `record.tenantId`.
  **`save` NO escribe `tenantId`** en SF4 (el alta de usuarios aún no
  acepta tenant; evitar null-outs accidentales → deuda F4).
- `LoginUseCase`: `generateToken(user.id, user.tenantId, user.role)`
  (ramas demo y password).
- `tests/integration/.../users.test.ts`: 6 llamadas
  `generateToken('user-admin')` → `('user-admin', null, 'admin')`.

**Política de tokens antiguos → RECHAZAR (decisión):**

- Token con formato viejo `{ userId }` o con campos ausentes →
  **401** con el mismo cuerpo que un token inválido (sin filtrar
  detalle) → se fuerza re-login. Alternativa descartada: aceptar con
  degradación (`role` undefined) — deja la app en estado ambiguo y en
  desarrollo re-login es barato. Cualquier token emitido antes de SF4
  muere al primer uso (no hay ventana de rotación que gestionar).

**Híbrido D4 (decisión — opción "más simple"):**

- `authMiddleware` confía en el rol/tenant del token → operaciones
  normales, sin DB.
- `adminMiddleware` **sigue como estaba, con DB lookup** (`findById` →
  `role !== 'admin'` → 403): es el gate sensible de D4 y ya protege
  `PUT/PATCH/DELETE /config/:key` y `GET /admin/bitacora`.
- **Sin `sensitiveAdminMiddleware` ni `verifyRoleFromDB`** en SF4:
  sin consumidores aún; SF6 decidirá si las rutas de superadmin
  reutilizan `adminMiddleware` o añaden helper.
- Confirmado con tests: token `role=admin` + DB `employee` → **403**;
  DB admin + token `role=employee` → **200** (en sensibles manda la
  DB, también contra un rol "degradado" en el token).

**Tests nuevos (19):**

- `tests/unit/infrastructure/middleware/auth.test.ts` (8): payload
  completo, `tenantId: null`, token legacy → 401, payload sin `role`
  → 401, sin `tenantId` → 401, firma inválida → 401, sin header →
  401, service token → `{ id: 'service', ... }`.
- `tests/integration/api/v1/auth.test.ts` (+10): payload por cada rol
  demo (4), usuario con `tenantId: 'ten-1'` → en el JWT, legacy → 401
  en `/users/me` y en ruta sensible, D4 híbrido (3).
- `LoginUseCase.test.ts` (+1): payload en los 4 demo + password +
  caso con `tenantId: 'ten-42'`.
- Helper `tests/helpers/jwt.ts`: `jsonwebtoken` no existe en la raíz
  del monorepo → `createRequire('.../backend/package.json')` para
  firmar tokens legacy/forged; decodificar payloads propios con
  `Buffer.from(part, 'base64url')` (sin dependencias).

### F2 / SF5 — Middleware de scope tenant (2026-09-27)

Backend-only (los E2E de `frontend/tests/e2e` se ajustan: los specs
que veían items pasan de `admin` a `owner`). Verificado: `npm test`
**97/97** (82 previos + 15 nuevos), `tsc` backend **0**,
`npm run test:front` **32/32**, `tsc` front **0**, seed re-ejecutado
en dev y prueba manual curl:

- owner → payload `tenantId: 'tenant-demo'` → `GET /items` → **200 (3 items)**
- admin → payload `tenantId: null` → `GET /items` → **403 `Tenant scope required`**

**`middleware/tenant.ts` (nuevo):**

- `tenantScope(req, res, next)`: exige `req.user.tenantId`; si es
  `null`/`undefined` → **403** `{ error: 'Tenant scope required' }`;
  si existe → inyecta **`req.tenantId`** y sigue. Exporta
  `TenantRequest` (= `AuthRequest` + `tenantId?: string`).
- Opciones de inyección consideradas: (a) top-level `req.tenantId`
  — **elegida** (ergonómica, la pide el DoD); (b) `req.tenant = { id }`
  — más ceremonia sin ganancia; (c) gate puro sin inyectar
  (downstream lee `req.user.tenantId`) — descartada: el DoD testa
  `req.tenantId` y los handlers futuros evitan `?.` anidado.

**Rutas con `tenantScope` (tras `authMiddleware`):**

`GET /items`, `GET /items/:id`, `POST /items`, `POST /items/:id/file`,
`DELETE /items/:id`, `GET /files/:key/url`.

**Excepción (decisión, opción 3): `PATCH /items/:id` NO pasa por
`tenantScope`.** Motivo: el orquestador (token de servicio,
`tenantId: null`) hace `PATCH /items/:id` en `FileProcessorWorkflow`
(`backend_client.patch_item_metadata`) — verificado que es la **única**
ruta `/items` que usa (la función `get_item` existe pero ningún
workflow la llama). Alternativas descartadas: bypass por `role:
service` en `tenantScope` (lógica a quitar en F3) y dejarlo estricto
(regresión real hoy por un modelo que se va). El comentario en
`routes.ts` remite a esta nota. **Se elimina en F3 con Item.**

**Rutas SIN `tenantScope` (y por qué):**

| Zona | Rutas | Motivo |
|------|-------|--------|
| Pública | `POST /auth/login`, `GET /health` | sin `authMiddleware` |
| Usuarios | `GET/POST /users`, `/users/me`, `/users/:id` | directorio plataforma + sesión hasta F4/F5; `/users/me` debe funcionar para admin sin tenant |
| Config | `GET /config*`, `PUT/PATCH/DELETE /config/:key` | config de plataforma (escritura con `adminMiddleware`) |
| Servicio | `GET /events/pending`, `PATCH /events/:id/{complete,fail}` | orquestador; fuera del scope por decisión |
| Superadmin | `GET /admin/bitacora` | prefijo propio + `adminMiddleware`; en SF6 llegan `/admin/tenants/...` (tampoco usan `tenantScope`) |

**Token de servicio ante `tenantScope`:** **no hay bypass por rol** —
el service token (tenantId null) recibe 403 en cualquier ruta tenant.
Sigue funcionando solo porque la única ruta que necesita
(`PATCH /items/:id`) está exenta. Si en F3+ el orquestador necesita
rutas tenant de nuevo, revisar decisión (bypass explícito vs scopes
por servicio).

**Convivencia con `adminMiddleware`:** ortogonales — `tenantScope`
responde *"¿puede operar en zona tenant?"* (token, sin DB);
`adminMiddleware` responde *"¿es admin?"* (DB lookup, D4). Hoy
ninguna ruta combina ambos.

**Seed SF5:** tenant **`tenant-demo`** (id fijo para tests/scripts;
slug `demo`; defaults SF2.1: `EUR`, `UTC`, `settings {}`,
`schedules []`, `holidays []`) creado **antes** de los usuarios;
`upsert` por id con `update: { name, slug }`. Usuarios:
`owner|employee|client@demo.com` → `tenantId: 'tenant-demo'`;
`admin@demo.com` → `null` (plataforma). El `update` del upsert de
usuarios incluye `tenantId` (un re-seed corrige la dev DB). Opciones
de id descartadas: uuid por run (los tests no lo referenciarían),
upsert por slug (el id lo exige el schema igualmente).

**Por qué el admin ya no ve items (diseño, no bug):** admin =
plataforma, no opera zona tenant; su dashboard devolverá 403 en
`GET /items` — semánticamente correcto en MR. **E2E:** los specs de
items/dashboard/navegación usan ahora `owner`; los E2E de admin
(bitácora/config) se añaden en **SF6**.

**Tests nuevos (15):**

- `tests/unit/infrastructure/middleware/tenant.test.ts` (4): con
  tenantId → pasa + `req.tenantId` inyectado; superadmin → 403; sin
  `req.user` → 403 defensivo; service token → 403.
- `tests/integration/api/v1/tenantScope.test.ts` (11): `GET /items`
  owner/employee → 200, admin → 403, sin token → 401; `GET /items/:id`
  owner → 200 / admin → 403 (gate antes del 404); `POST /items` y
  `GET /files/:key/url` admin → 403; excepción `PATCH /items/:id` sin
  tenant → 200; regresión `GET /users` admin → 200 y `/users/me` → 200.
- Nota de tipos: con `tenantScope` en la firma de `router.get`, los
  handlers de `:id`/`:key` con `req: AuthRequest` reciben
  `params` `string | string[]` (`ParamsDictionary`) → cast
  `as { id: string }` (mismo patrón que PATCH/DELETE).

### Deuda pendiente

- **`PATCH /items/:id` sin `tenantScope`** (excepción del orquestador,
  service token): única ruta tenant exenta → **se elimina en F3** con
  el modelo Item.
- **`tenantScope` es solo gate de acceso**: ningún handler filtra
  queries por `req.tenantId` todavía (los items se listan enteros).
  El filtrado por fila llega con las rutas de dominio MR (F3+) —
  hoy `req.tenantId` lo consume únicamente el propio middleware.
- **`GET /users/me` no devuelve `tenantId`** (solo
  id/name/email/role): añadir cuando el frontend lo necesite (SF6+).
- Rutas de dominio MR (`/reservations`, `/services`, …) **aún no
  existen**: `tenantScope` se aplicará a ellas en F3+; la excepción de
  `PATCH /items/:id` y la clasificación de zona se revisan entonces.

- **JWT con rol/tenant inyectados pero sin consumidores:**
  `req.user.role`/`tenantId` llegan desde **SF4**, pero hoy solo se
  lee `id` en rutas. El uso real llega con el scoping de tenant
  (F4/F5) y cualquier frontend que quiera leer el token (F5/F6).
  `adminMiddleware` sigue siendo el único gate con DB.
- **`PrismaUserRepository.save` no escribe `tenantId`** (y
  `POST /users` no lo acepta): `toDomain` sí lo lee (SF4). El alta de
  usuarios con tenant llega en F4/F5.

- **F3:** eliminar `Item` (+ seed + rutas + frontend). ~~Migrar `role`
  a enum MR~~ — hecho en backend por **SF3a** y en frontend por
  **SF3b**.
- **`tests/globalSetup.ts` usa `db push --force-reset`, bloqueado** por
  el gate de consentimiento de Prisma 7 ante IA: el test DB solo se
  sincera con un `db push` aditivo manual (sin `--force-reset`) o con
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Igual exigen
  consentimiento los `db push --accept-data-loss` (p. ej. al añadir
  unique constraints). Si el schema del test DB queda desfasado, los
  tests fallan con "column does not exist".
- **M2M `Employee↔Service` sin `onDelete` explícito** (default de
  Prisma). Hoy no importa (borrado duro de `Service` no existe;
  `isActive`), revisar si en algún momento se permite delete duro.
- **`User.email` único global:** dos tenants no pueden tener el mismo
  email de login. Cambiarlo a `@@unique([tenantId, email])` obliga a
  rediseñar el login (búsqueda por email global).
- **`price` Decimal → string en API.** Definir formato de respuesta
  en F3 antes de exponer precios.
- **Formato de `activeKey`** (`{employeeId}-{date}-{startTime}`) sin
  constraint más allá de la unicidad; implementación y limpieza al
  cancelar/completar en F3.
- **Baseline de typecheck obsoleto:** AGENTS.md documenta ~146 errores
  de `tsc` en backend; hoy mide **0**.

## Decisiones arquitectónicas

- **`db:push` con backup automático.** `npm run db:push` ejecuta
  primero `db:backup` (`pg_dump` → `backend/prisma/backups/` con
  timestamp + symlink `latest.sql`, gitignorado) y solo después
  pushea. `npm run db:push:no-backup` omite el backup para casos
  donde no aplica (p. ej. la test DB, que se resetea en cada run —
  `tests/globalSetup.ts` llama a `prisma db push --force-reset`
  directamente, sin pasar por `npm run db:push`). Motivo: el push de
  SF3a (`text → enum`) dropeó la columna y perdió el rol de
  `admin@demo.com` (ver "F2 / SF3a").

- **Config pre-login (futuro).** Hoy `ConfigProvider` solo hace
  fetch/poll con sesión activa (sin token: sin fetch, sin 401). Si
  aparece la necesidad de config antes de login (feature flags,
  idioma público, etc.), evaluar:
  - **Opción B:** endpoint público `GET /config/public` (solo claves
    whitelisted).
  - **Opción C:** segundo fetch público opcional, bajo el provider ya
    autenticado (gate actual por `useUser().id`).
- **Bitácora exclusivamente admin.** No existe `GET /bitacora` fuera
  del prefijo `/admin/`; la lectura del audit log es solo admin.
