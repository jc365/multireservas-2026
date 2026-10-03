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

### Seguridad

- **Secretos placeholder en `.env.example`** (`JWT_SECRET`,
  `ADMIT_TOKENS`, `SEND_TOKEN`). Funcionan en local, pero es
  **obligatorio** cambiarlos antes de desplegar a producción.
  Generar secreto: `openssl rand -hex 32`.

## Deuda viva — Borrado (F5+)

### Borrado diferido de ficheros (prioridad: cuando haya ficheros)

**Cuándo:** cuando `storageService` despierte (F5+), es decir,
cuando MR empiece a manejar ficheros asociados a recursos (fotos de
servicios, avatares, documentos de empleados, etc.).

**Problema:** borrar un recurso con ficheros en R2/S3 en la operación
principal bloquea al usuario (I/O remoto). Y si el borrado falla a
medias, quedan ficheros huérfanos en el storage.

**Idea:** cuando se borra un recurso con ficheros:
1. **No borrar los ficheros en la operación principal.**
2. **Encolar el borrado** en un job.
3. Un **proceso en background** los borra (con retry).

**Implementación:**
- **Opción A:** usar el **orquestador** (FastAPI) con un workflow
  `file.delete` y una cola en `EventQueue`. **Reutiliza
  infraestructura existente.**
- **Opción B:** un job queue dedicado (Redis + BullMQ).
- **Opción C:** un cron job que escanea ficheros huérfanos
  periódicamente.

**Decisión pendiente.** Mi voto: **A** (reutilizar el orquestador),
cuando toque.

**Origen:** trait `BorrableEnCascada` (proyecto PHP anterior,
`DelayFile`). La idea es buena; el código no aplica (allí no había
FKs ni R2).

### Delete preview (prioridad: baja)

**Cuándo:** cuando el volumen de datos lo justifique. No urgente.

**Problema:** un borrado (especialmente desde el admin, F4.0+) puede
arrastrar dependencias no evidentes. "Voy a borrar este tenant" → y
se lleva por delante 500 reservas.

**Idea:** antes de borrar, mostrar qué depende del recurso:
- **Soft delete de Employee** → reservas activas/futuras.
- **Borrado de Service** → reservas activas.
- **Borrado de Tenant (admin)** → número de empleados, servicios,
  reservas.

**Implementación:**
- Endpoint `GET /<recurso>/:id/delete-preview` que devuelve
  `{ canDelete: boolean, dependencies: { reservations: N, ... } }`.
- Opcional: flag `?dryRun=true` en el `DELETE`.

**Origen:** trait `BorrableEnCascada` (proyecto PHP anterior, modo
"simulación" con rollback). En PHP solo era para admin; aquí también
sería para admin/superadmin, no para el día a día del owner.

**Nota:** en MR, el borrado en cascada real **no aplica** — lo hacen
las FKs de PostgreSQL (`onDelete: Restrict` / `SetNull` / `Cascade`).
El "preview" es un añadido de UX, no una necesidad técnica.

### Lo que NO se porta del trait PHP

- **Borrado en cascada manual:** lo hacen las FKs de PostgreSQL. No
  hay que reimplementarlo.
- **Dígito de control módulo 11:** los IDs de MR son `genUUID` con
  nanoid (no adivinables, no secuenciales). Añadir un dígito de
  control no aporta.

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

- ~~**`PATCH /items/:id` sin `tenantScope`** (excepción del
  orquestador)~~ — **cerrado en F3.1**: la ruta desaparece con el
  modelo Item; no queda ninguna ruta tenant exenta.
- **`tenantScope` es gate + filtrado parcial**: `/services` ya filtra
  por fila (`findByTenantId` / comparación de `tenantId` → 404);
  `GET/POST /users`, `/config*` y bitácora siguen **sin** filtrar por
  tenant — pendiente cuando el dominio lo exija.
- **`GET /users/me` no devuelve `tenantId`** (solo
  id/name/email/role): añadir cuando el frontend lo necesite (SF6+).
- ~~Rutas de dominio MR inexistentes~~ — **parcialmente cerrado en
  F3.1**: `/services` existe con `tenantScope`; `/reservations`,
  `/employees`, `/clients` llegan en F4+.

- **JWT con rol/tenant inyectados pero sin consumidores:**
  `req.user.role`/`tenantId` llegan desde **SF4**, pero hoy solo se
  lee `id` en rutas. El uso real llega con el scoping de tenant
  (F4/F5) y cualquier frontend que quiera leer el token (F5/F6).
  `adminMiddleware` sigue siendo el único gate con DB.
- **`PrismaUserRepository.save` no escribe `tenantId`** (y
  `POST /users` no lo acepta): `toDomain` sí lo lee (SF4). El alta de
  usuarios con tenant llega en F4/F5.

- ~~**F3:** eliminar `Item` (+ seed + rutas + frontend)~~ — **hecho en
  F3.1** (ver sección F3.1 abajo). ~~Migrar `role` a enum MR~~ — hecho
  en backend por **SF3a** y en frontend por **SF3b**.
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
- **`price` Decimal → string en API.** `Service.price` se formatea ya
  en frontend (`formatPrice`, EUR/es-ES); `Reservation.price` definirá
  su formato cuando llegue el modelo (F4+).
- **Formato de `activeKey`** (`{employeeId}-{date}-{startTime}`) sin
  constraint más allá de la unicidad; implementación y limpieza al
  cancelar/completar de reservas (F4+).
- **Baseline de typecheck obsoleto:** AGENTS.md documenta ~146 errores
  de `tsc` en backend; hoy mide **0**.

## F3 / F3.1 — Item → Service: el dominio MR llega al código (2026-09-28)

Rama `feature/f3-cruds` (F2 squasheada: `eda6eb7`). Backend + frontend
+ tests + seed + docs. Verificado:

- `npm test` **167/167** (18 ficheros; tests de Item reemplazados por
  los nuevos de Service), `tsc` backend **0**.
- `npm run test:front` **43/43**, `tsc -b` front **0**.
- E2E `critical-flows` **6/6** con Chrome del sistema
  (`channel: 'chrome'`): la cache de Playwright 1.63 pide chromium
  1243 y hay 1228 (config temporal, no commiteado).
- `db push` (backup automático + consentimiento Prisma 7 para
  `--accept-data-loss`: cae la tabla `Item` con 3 filas demo) + seed
  con `svc-demo-1/2/3`.
- Prueba manual curl (owner/`tenant-demo`): POST → 201, GET lista → 4
  servicios, GET id → 200, PUT → 200 (name/price/isActive), DELETE →
  204, GET tras delete → 404; validaciones → 400 (`duration` 17 y 195);
  admin → 403 `Tenant scope required`.

### Decisiones (punto ambiguo → opción elegida)

- **File upload "dormido":** se elimina `UploadItemFileUseCase`,
  `POST /items/:id/file` (+ `demoFileUpload`), `FileViewerModal`,
  `SubmitFileModal`, `useFileUrls` y el `dispatchEvent('file_uploaded')`.
  Se conservan **sin emisores** `storageService` (R2 + fallback local)
  y `GET /files/:key/url` (con `authMiddleware` + `tenantScope`), por
  si otra entidad futura los necesita.
- **Permisos de services (matriz `roleConfig.ts`):** `owner` → ver +
  editar, `employee` → ver, `admin` → **sin acceso** a la zona tenant
  (coherente con el 403 de `tenantScope`; su panel es `/admin`),
  `client` → sin acceso (no autentica en v1). Motivo: el owner
  configura el catálogo; el empleado lo ofrece pero no lo modifica.
  La nav (`Layout.tsx`) gating por `can()`; `Dashboard` hace fetch solo
  con `viewServices`.
- **Validación de `duration`:** múltiplo de `slotDuration` (15), ≥ que
  él y ≤ `maxServiceDuration` = **12 × slotDuration** (leído de
  `tenant.settings.maxServiceDuration`, fallback 180 si
  `settings {}`). Backend en Create/Update vía
  `BookingSettings.fromTenantSettings`; frontend expone un `<select>`
  de 15 a 180 paso 15. **No editable desde el front del owner en v1**
  (lo pondrá el admin en F5/SF6).

### Backend

- Entity `Service` (`genUUID('svc')`): `tenantId, name, description,
  duration, price, category, isActive, timestamps`. VOs `ServiceName`
  (3–200) y `BookingSettings` (defaults `DEFAULT_SLOT_DURATION=15`,
  `MAX_SERVICE_DURATION_FACTOR=12`). `create()` valida
  duration/price (0–99999999.99, ≤2 dec.)/description(≤2000)/
  category(≤100); `reconstitute()` solo invariantes duros.
- Puertos `IServiceRepository` + `ITenantRepository`; impls
  `PrismaServiceRepository` / `PrismaTenantRepository` (con `select`).
- Use cases `application/use-cases/services/` (Create/List/Get/
  Update/Delete) con bitácora `create_service`/`update_service`/
  `delete_service`; Create/Update inyectan `ITenantRepository` para
  leer settings.
- Rutas `/services` (GET/POST; GET/PUT/DELETE `:id`) con
  `tenantScope`. **PUT, no PATCH** (según enunciado F3.1). Filtrado
  por fila: `List` → `findByTenantId`; Get/Update/Delete comparan
  `tenantId` → **404 `Service not found`** (no filtran existencia).
- Eliminados: `Item.ts`, `ItemTitle.ts`, `IItemRepository.ts`,
  `PrismaItemRepository.ts`, `demoFileUpload.ts`, `use-cases/items/`
  (6), tabla `Item`, `User.items`.
- `GET /files/:key/url` queda **dormida** (sin consumidores) pero
  sigue protegida por `tenantScope`.

### Frontend

- `utils/booking.ts` (nuevo): `SLOT_DURATION=15`,
  `MAX_SERVICE_DURATION=180`, `serviceDurationOptions()`,
  `formatPrice()` (EUR, `es-ES`).
- `roleConfig.ts`: `viewServices`/`editServices` (+ test); la sección
  `items` desaparece.
- Nav `Layout.tsx` gating por permiso (`/services` → `viewServices`,
  `/services/create` → `editServices`); `Dashboard.tsx` reescrito
  (fetch gateado + CTA + mensaje sin permiso); páginas `Services` /
  `CreateService` / `ServiceDetail`; borradas `Items` / `CreateItem` /
  `ItemDetail` + modales de fichero + `useFileUrls`.
- `api/client.ts`: TTL/invalidación `/items` → `/services`.
- `BitacoraPage`: acciones del filtro → `create/update/delete_service`
  (se van `*_item` y `file_uploaded`).
- E2E `critical-flows`: rutas `/services`, textos y roles ajustados.

### Deuda nueva / abierta

- **Workflows orquestador sin emisores:** `FileProcessorWorkflow`
  (`item.created`) y `file_uploaded` ya no reciben eventos; no se tocan
  en F3.1 (retirar o re-adaptar en F4+).
- **Defaults de booking duplicados:** `SLOT_DURATION`/
  `MAX_SERVICE_DURATION` en frontend hasta que haya endpoint de tenant
  settings (F5/SF6).
- **`maxServiceDuration` no editable en UI v1** (solo settings JSON).
- **Tests de dominio antiguo no migrados:** los tests de `Item` se
  eliminaron con el modelo; solo se añaden los nuevos de F3.1.

## F3 / F3.2 — Employee CRUD (2026-09-28)

Rama `feature/f3-cruds` (continúa F3.1). Backend + frontend + tests +
seed + docs. Verificado:

- `npm test` **264/264** (25 ficheros; +Employee entity, 5 use cases
  de employees, integración `/employees`), `tsc` backend **0**.
- `npm run test:front` **56/56**, `tsc -b` front **0**.
- Seed: `emp-demo-1` ligado a `user-employee-1` (employee@demo.com).
- Prueba manual curl (owner/`tenant-demo`): POST → 201 con
  `tenantId` inyectado y defaults; GET lista owner → solo activos del
  tenant; GET lista employee → **solo `emp-demo-1` (self-view)**;
  admin → 403 `Tenant scope required`; GET/PUT/DELETE cross-tenant
  (`emp-foreign` en `tenant-other`) → 404; `serviceIds` ajenos → 400;
  `userId` ya vinculado → 400; DELETE → 204, detalle → 200 con
  `isActive:false`, lista por defecto lo excluye,
  `?includeInactive=true` lo incluye (y el rol employee no lo honra).

### Decisiones (las 8 del enunciado F3.2)

- **`customSchedule`/`customHolidays` = JSON simple:** solo se valida
  que sea un objeto plano (no array/string/null) en escritura.
  Validación de forma completa y subconjunto del tenant → **F3.5**.
- **`serviceIds` M2M con checkboxes:** si `offersAllServices=true` los
  checkboxes están deshabilitados (todos marcados); al pasar a `true`
  la M2M **se limpia** (entity `withUpdates` + `services: {set: []}`).
- **`userId` opcional:** aceptado y validado en backend, asignado en
  seed; **sin frontend** en esta sub-fase.
- **Permisos (`roleConfig.ts`):** `viewEmployees`/`editEmployees` —
  owner T/T, employee T/**F** (el backend además hace self-view),
  admin F/F (403 `tenantScope`), client F/F.
- **Soft delete:** `DELETE /employees/:id` → `isActive=false` (la fila
  y su M2M se conservan). `ListEmployees` filtra `isActive:true` por
  defecto; `?includeInactive=true` **solo lo honra el rol owner**;
  `GetEmployee` devuelve también los inactivos.
- **Aislamiento cross-tenant** idéntico a Service: List por
  `findByTenantId`; Get/Update/Delete comparan `tenantId` → 404 sin
  filtrar existencia.
- **Bitácora:** `create_employee`/`update_employee`/`delete_employee`
  (+ acciones nuevas en el filtro de `BitacoraPage`).
- **`serviceIds` validados contra el tenant** en Create y Update.

### Descubrimiento: `Employee.userId` es `@unique` (1:1)

El esquema impone **un usuario ↔ un empleado**. Sin validar, el upsert
rompía con `Unique constraint failed on the constraint:
Employee_userId_key` y el route lo mapeaba a un 400 con mensaje de
Prisma. Añadido `IEmployeeRepository.findByUserId` + chequeo en
Create/Update → **400 `userId is already linked to another employee`**
(Update ignora el propio `id`, re-enviar el vínculo propio no cuenta).

### Backend

- VO `EmployeeName` (3–200, espejo de `ServiceName`); entity
  `Employee` (`genUUID('emp')`): email vía `Email.isValid`, phone ≤50
  (vacíos → null), JSON objeto plano, `serviceIds` normalizado
  (trim/dedupe); `offersAllServices` default `true` → `serviceIds=[]`
  forzado; `reconstitute()` lee el JSON tal cual (validación solo en
  escritura).
- Puerto `IEmployeeRepository`: `findById`, `findByTenantId(+options)`,
  `findByUserId`, `save` (upsert + `services:{set/connect}`),
  `deactivate` (soft delete sin tocar M2M). JSON nullable →
  `Prisma.DbNull`.
- `IServiceRepository.findByIds` **nuevo** (para validar la M2M).
- Use cases `application/use-cases/employees/` (Create/List/Get/
  Update/Delete): FK de `userId` (existe + mismo tenant + único),
  `serviceIds` del tenant, List con self-view para rol `employee`
  (filtra `userId === requesterId`), `includeInactive` solo owner.
- Rutas `/employees` (GET/POST; GET/PUT/DELETE `:id`) con
  `tenantScope`, guard `!tenantId → 403`, mapeo `not found → 404` y
  resto → 400, respuesta vía `employeeResponse()` (incluye
  `serviceIds`, `userId`, JSONs, `isActive`).

### Frontend

- `roleConfig.ts`: `viewEmployees`/`editEmployees` (+ test).
- Nav `Layout.tsx`: `/employees` (icono `group`) y `/employees/create`
  (`person_add`) gating por permiso (+ tests por rol).
- Páginas nuevas: `Employees` (lista + toggle "Include inactive" solo
  owner), `CreateEmployee` (checkboxes de servicios + textareas JSON
  simples con `JSON.parse` controlado), `EmployeeDetail` (detalle con
  los JSONs formateados + modal de edición + soft delete con
  `ConfirmDialog`).
- `Dashboard.tsx` reescrito con **dos secciones agrupadas** (Services
  y Employees, cada una con su CTA); subtítulo nuevo *"Your services
  and team at a glance."* (`App.test.tsx` ajustado + fetch de
  `/employees`).
- `api/client.ts`: TTL 5 min + invalidación `/employees`.
- `BitacoraPage`: `ACTION_OPTIONS` += `create/update/delete_employee`.

### Tests nuevos

- Backend: `tests/unit/domain/entities/Employee.test.ts` (21),
  `tests/unit/application/use-cases/employees/*.test.ts` (5 ficheros,
  mocks `findByUserId` incluido), `tests/integration/api/v1/employees.test.ts`
  (CRUD + tenantScope + aislamiento + M2M en BD + userId FK/unique +
  soft delete).
- Frontend: `pages/Employees.test.tsx` (lista/crear/editar/gating),
  `roleConfig.test.ts` (+matriz employees), `Layout.test.tsx` (nav por
  rol), `App.test.tsx` (subtítulo + fetch `/employees`).

### Deuda nueva / abierta

- **`customSchedule`/`customHolidays` sin validación completa** (solo
  objeto plano) → **F3.5** (subconjunto de `Tenant.schedules`/
  `holidays`).
- **`userId` sin UI:** vinculación solo por seed/API directa; si el
  front necesita asignarla → F4+.
- **Dashboard con dos entidades:** el layout por secciones es
  funcional; un rediseño (resumen numérico, tabs) queda para F4+.
- **Escrituras no restringidas por rol en backend:** igual que
  Service, las rutas `/employees` solo exigen `tenantScope` (el gating
  de rol es frontend `can()`); si se quiere prohibir que un employee
  escriba en backend → añadir check de rol en F4+.

## F3 / F3.3 — Client interno + Reservation CRUD básico (2026-09-29)

Rama `feature/f3-cruds` (continúa F3.2). Backend + frontend + tests +
seed + docs. Verificado:

- `npm test` **423/423** (35 ficheros; entities `Client`/`Reservation`,
  `FindOrCreateClient`, 5 use cases de reservations, integración
  `/reservations`, `EmailService`), `tsc` backend **0**.
- `npm run test:front` **73/73**, `tsc -b` front **0**.
- Seed: `cli-demo-1` (Laura Gómez) + `res-demo-1` (fecha futura
  relativa, `cancelToken: demo-cancel-token-1`); el upsert del tenant
  ahora **re-aplica `settings`** (antes solo en `create` → las BD dev
  existentes se quedaban con `{}`).
- Prueba manual curl (owner/`tenant-demo`): POST → 201 con `status:
  confirmed`, `activeKey` y `cancelToken`; mismo teléfono en 3 creates
  → **mismo `cli-*`, `visitCount=3`** en BD; overlap exacto/parcial →
  409 `'Reservation overlaps an existing reservation'`; `duration` ≠
  `Service.duration` → 400; fecha pasada → 400; employee crea → 201
  (T/T DoD #13); admin GET/POST → 403 `Tenant scope required`;
  cross-tenant real (`tenant-other` fixture en BD): `clientId`/
  `employeeId` ajenos → 400, GET/PUT de fila ajena → 404, lista solo
  devuelve las propias; token público sin auth: GET → reserva, POST →
  `cancelled` + `activeKey=null`, 2ª POST → 409, token inválido →
  404; PUT notes → 200; cancel vía PUT owner → 200 y el hueco del
  `activeKey` liberado acepta un nuevo create → 201.
- Email de confirmación en consola (`EmailService[console]`) con
  subject, body y link `/reservations/cancel/:token` bajo
  `FRONTEND_URL`/`CORS_ORIGIN`/`:5173`.
- Bitácora (filtro `/admin/bitacora?action=…`): `create_reservation`,
  `update_reservation` (notes y status) y `cancel_reservation`
  (`previousStatus` en metadata). El cancel **por token no loguea**
  (no hay actor).

### Decisiones (las 15 del enunciado F3.3)

- **Client interno, sin CRUD expuesto:** se crea o reutiliza al crear
  la reserva (`FindOrCreateClientUseCase`); búsqueda `tenantId+phone`
  (ordenado por `createdAt` desc), fallback `email` si cambia.
- **`dataExpiresAt` = `clientDataRetention`** del tenant
  (`nextDay`+1d, `nextMonth`+1 mes, `never`→null; **desconocido o
  ausente → `nextMonth`** por defecto, nunca `null` — F3.3.1, RGPD-
  safe). Antes de F3.3.1 el desconocido devolvía `null`.
- **Flags** `requireClientPhone=true` / `requireClientEmail=false`
  **hardcodeados en el frontend** hasta F3.5 (configurables).
- **`visitCount` +1 por reserva creada; `lastVisit` = fecha de la
  reserva más futura** del cliente (`startTimeUTC`): solo avanza si la
  nueva reserva es posterior; si es anterior o igual no se toca
  `lastVisit` ni `dataExpiresAt` (lógica F3.3.1, ver subsección).
- **Validaciones sin motor de disponibilidad:** fecha futura,
  `duration` opcional pero debe ser `Service.duration`, referencias
  (`employeeId`/`serviceId`/`clientId`) contra el tenant (400) y
  **no solapamiento**.
- **Solapamiento con doble defensa:** (a) `activeKey` único
  `{employeeId}-{date}-{startTime}` en UTC + catch Prisma `P2002` →
  409; (b) intersección de intervalos contra
  `findByTenantId(tenantId,{employeeId,date})` filtrando activas. Al
  terminal (cancelled/completed/no_show) `activeKey` → null y el
  hueco queda libre.
- **`cancelToken` = nanoid(21) único** en la reserva.
- **Email de confirmación enviado desde el backend** al crear
  (`EmailService`: `console` por defecto, `resend`, `smtp` → degrada
  a console con warning una vez; `send()` nunca lanza).
- **Endpoints públicos** `GET/POST /api/v1/reservations/cancel/:token`
  **antes de `authMiddleware`** (con `apiLimiter`); el GET no 404a el
  token vacío/inexistente (devuelve la reserva o `Reservation not
  found` gestionado en el front).
- **Sin límite de tiempo** para cancelar por token.
- **Status inicial `confirmed`** (no `pending`).
- **Permisos (`roleConfig.ts`):** `viewReservations`/
  `editReservations` — owner T/T, **employee T/T**, admin F/F (403
  `tenantScope` en backend), client F/F (solo frontend, igual que el
  resto de tenant zone).
- **Cross-tenant:** referencias ajenas → 400 con mensaje propio;
  fila ajena en GET/PUT → 404 (no se filtra existencia).
- **Bitácora** `create_reservation`/`update_reservation`/
  `cancel_reservation`; cancel por token sin bitácora (sin actor).

### Backend

- Entities `Client` (`genUUID('cli')`, `registerVisit`, `withPhone`)
  y `Reservation` (`genUUID('res')`, `buildActiveKey`,
  `withStatus`/`withNotes`, `ACTIVE_STATUSES`/`TERMINAL_STATUSES`,
  cancelToken nanoid).
- Puertos `IClientRepository` y `IReservationRepository` (devuelve
  `ReservationWithRelations {reservation, client, employee, service}`
  para evitar N+1; `service`/`employee` price como `Number()`);
  `ITenantRepository.TenantSettingsRecord` += `timezone?`.
- `PrismaClientRepository`: `findFirst` por `tenantId+phone`
  (orden `createdAt` desc), `findUnique tenantId_email`, `upsert`.
- Use cases `use-cases/clients/` y `use-cases/reservations/`
  (Create/List/Get/Update/Cancel): Create orquesta FindOrCreateClient
  → validaciones → overlap → insert → `registerVisit` → email →
  bitácora → re-read con relaciones; Update solo `notes`/`status` (y
  re-valida solapamiento al reactivar de terminal a activo); Cancel
  con `execute(id,tenantId,by)` (bitácora) y `executeByToken(token)`
  (sin bitácora).
- `EmailService` (`infrastructure/email/`): singleton, helpers
  `getFrontendOrigin()` (`FRONTEND_URL` → 1er `CORS_ORIGIN` →
  `http://localhost:5173`), sin dependencias nuevas.
- Rutas: públicas `GET/POST /reservations/cancel/:token` (antes del
  `authMiddleware`); bloque protegido con `reservationResponse()`
  (serializer con relations + `cancelToken`) y
  `reservationErrorStatus()` (`not found`→404, `overlap`/`already`→
  409, resto→400).

### Frontend

- `roleConfig.ts`: `viewReservations`/`editReservations` (+ test).
- Nav `Layout.tsx`: `/reservations` (icono `event`) y
  `/reservations/create` (`add_task`) gating por permiso.
- `App.tsx`: ruta **pública** `/reservations/cancel/:token` fuera de
  `Layout` (sin auth) + 3 rutas dentro (`/reservations`,
  `/reservations/create`, `/reservations/:id`); sin conflicto con
  `:id` (2 vs 3 segmentos).
- Páginas nuevas: `Reservations` (lista + filtro status, exporta
  `ReservationView`/`STATUS_STYLES`/`clientName`/`formatSlot`),
  `CreateReservation` (selects de empleado/servicio activos, fecha +
  hora locales → `startTimeUTC` ISO, phone requerido/email opcional
  hardcodeados hasta F3.5), `ReservationDetail` (relaciones, notes,
  cancel con `PUT status`, link de cancelación público con
  `window.location.origin`), `CancelReservation` (pública por token:
  fases loading/ready/cancelling/cancelled/not_found/already/error).
- `Dashboard.tsx`: sección Reservations (≤5 con badge de estado,
  CTA Create, estado vacío) gating por permiso.
- `api/client.ts`: TTL 60 s `/reservations` + invalidación;
  `BitacoraPage`: `ACTION_OPTIONS` += `create/update/cancel_reservation`.

### Tests nuevos

- Backend: `tests/unit/domain/entities/{Client,Reservation}.test.ts`,
  `tests/unit/application/use-cases/clients/FindOrCreateClientUseCase.test.ts`,
  `tests/unit/application/use-cases/reservations/*.test.ts` (5
  ficheros), `backend/src/infrastructure/email/emailService.test.ts`,
  `tests/integration/api/v1/reservations.test.ts` (201, reutilización
  + `visitCount`, email fallback, bitácora, 409 overlap exacto/parcial,
  400 duration/pasado/cross-tenant refs/phone, admin 403, 401, filtros,
  cross-tenant 404 GET/PUT, PUT notes/cancel + hueco liberado,
  token GET/POST/2ª→409/404 inválido/sin bitácora).
- Frontend: `pages/Reservations.test.tsx` (lista/filtro/crear con
  payload exacto/error 409/gating + detalle con notes/cancel),
  `pages/CancelReservation.test.tsx` (flujo completo 404/409),
  `roleConfig.test.ts` (+matriz reservations).

### Deuda nueva / abierta

- **Sin motor de disponibilidad ni timezone:** `date` (día calendario)
  y `startTimeUTC` se aceptan sin comprobar coherencia entre tz;
  horarios, festivos y solapes reales → **F4** (`TimezoneService`).
- **Flags `requireClientPhone`/`requireClientEmail` hardcodeados en
  frontend** hasta **F3.5** (vendrán de `GET /config`).
- **`smtp` del backend degrada a console** (warning una vez) →
  backend **F4** (orquestador ya tiene SMTP propio).
- **Reschedule no implementado:** `UpdateReservation` solo admite
  `notes`/`status`; cambiar fecha/hora/empleado → **F4** (con
  re-validación de solape).
- **Solo email de confirmación**; no se envía email al cancelar.
- **Serializer de reserva no incluye `visitCount`** del client (la UI
  no lo muestra; si se necesita → añadir a `reservationResponse`).
- **Cliente huérfano en reserva fallida:** `FindOrCreateClient` corre
  antes que el solape → un 409 puede dejar un client nuevo en BD
  reutilizable, con `visitCount`+1 y `lastVisit` = fecha intentada
  (F3.3.1) ya registrados aunque la reserva no llegue a crearse.
  Aceptado por ahora.
- **Escrituras no restringidas por rol en backend** (igual que
  Service/Employee): las rutas `/reservations` solo exigen
  `tenantScope`; el gating employee-escritura es frontend `can()` (el
  backend permitiría un employee roll más adelante) → F4+ si se
  quiere prohibir.

### F3.3.1 — Mini-fix de retención de clientes (2026-09-29)

Rama `feature/f3-cruds`, tras `69de164`. Solo
`FindOrCreateClientUseCase`, `CreateReservationUseCase` y tests.
Verificado: `npm test` **431/431** (35 ficheros, +8 tests),
`tsc` backend **0**; curl manual:

- Reserva futura (+7d) con cliente nuevo → `lastVisit` =
  `startTimeUTC` de la reserva, `dataExpiresAt` = +1 mes (settings
  `nextMonth` del seed), `visitCount=1`.
- Reserva anterior (+3d, mismo teléfono) → `visitCount=2` y
  `lastVisit`/`dataExpiresAt` **sin cambios**.
- Cancelación por token → cliente **sin cambios**.

Cambios:

- **Default de retención `nextMonth`:** `computeDataExpiresAt` con
  valor desconocido/ausente devuelve `lastVisit + 1 mes` en lugar de
  `null` (Riesgo RGPD: `null` = caduca nunca). Solo `never` sigue
  devolviendo `null`.
- **`lastVisit` = reserva más futura:** `FindOrCreateClient.execute`
  acepta `visitAt` (el `startTimeUTC` de la reserva que se crea, lo
  pasa `CreateReservationUseCase`; por defecto `now` si se llama sin
  más). `visitCount` siempre +1; `lastVisit`/`dataExpiresAt` solo
  cambian si `visitAt` es **posterior** al `lastVisit` actual (si es
  anterior o igual, se re-envían los valores actuales a
  `registerVisit`, que solo incrementa el contador). Cliente nuevo →
  `lastVisit` = fecha de su primera reserva.
- **No cambiado (explícito):** el `cancelToken` **sigue válido tras
  cancelar** (un segundo pulso da 409 "already cancelled", más claro
  que 404); la cancelación **no recalcula** `lastVisit` ni
  `dataExpiresAt` (efecto colateral aceptado: si el cliente cancela
  su reserva más futura, el registro se borra `retención` después de
  esa fecha).
- **`clientId` explícito en el POST no registra visita** (igual que
  en F3.3): la lógica vive en el flujo del cliente interno
  (`FindOrCreateClient`). Si se quiere asumir también ahí → F4+.

Tests: `computeDataExpiresAt` desconocido → `nextMonth` (unit,
2 tests actualizados); bloque "lastVisit = reserva más futura"
(posterior/anterior/igual/nuevo, unit ×4); `CreateReservation` pasa
`startTimeUTC` como `visitAt` (unit); integración ×3 (posterior
avanza, anterior no toca, cancelar no toca). La deuda "retención
desconocida → null" queda retirada (ver Decisiones arriba).

## F3 / F3.4 — Tenant config + dayMaster + RRule (2026-09-29)

Rama `feature/f3-cruds`, tras `865bcc0`. La entidad `Tenant` (fila en
BD desde F3.1) llega al dominio: perfil + settings + schedules +
holidays con validación estricta, RRule derivada al guardar y
`GET/PUT /tenants/me`. Verificado: backend `npm test` **525/525**
(43 ficheros, +94), `tsc` **0**; frontend `npm run test:front`
**87/87** (10 ficheros, +13), `tsc -b` **0**; curl DoD abajo.

### Decisiones (enunciado F0 #1–14 + puntos abiertos)

1. `schedules`/`holidays` como JSON en la fila `Tenant` (ya estaban
   en el schema desde F3.1); sin tablas nuevas.
2. La **RRule es derivada**: fuente de verdad = bloque estructurado;
   se genera al guardar (`dayMaster`) y se almacena en el JSON para
   F4. Si el input trae una rrule ajena, se ignora y regenera.
3. `dayMaster` en `backend/src/domain/utils/dayMaster.ts`: mapeo
   `mon..sun` ↔ `MO..SU` (`DAYS_MAP`, `RRULE_DAYS_MAP`,
   `toRRuleDays`, `fromRRuleDays`, `generateRRuleFromSchedule`,
   `generateRRuleFromHoliday`, `isValidDate`). Sin i18n (SF8).
4. Settings: `slotDuration` ∈ {15,30,45,60} (default 15),
   `maxServiceDuration` múltiplo ≥ slot (default 12×),
   `clientDataRetention` ∈ {nextDay,nextMonth,never} (default
   nextMonth), `defaultLanguage` (default `'en'`, sin consumidor
   hasta SF8), `requireClientPhone` (default true),
   `requireClientEmail` (default false).
5. Schedule block `{label, days[], start, end, breaks[]}` con horas
   `HH:MM` y breaks dentro del rango; Holiday `{label, date
   YYYY-MM-DD, recurring}`.
6. `currency` ∈ {EUR,USD,GBP}; `timezone` IANA validada con
   `Intl.DateTimeFormat` (acepta con espacios alrededor).
7. `GET /tenants/me` devuelve el tenant completo **sin empleados ni
   servicios**.
8. `PUT /tenants/me` actualiza **todo en un solo guardado**
   (`saveConfig`): valida perfil + settings + schedules + holidays y
   regenera todas las RRules antes de escribir (todo o nada: un
   error no toca la BD ni la bitácora).
9. **Permisos (#13, voto):** `editTenantConfig` = solo owner;
   `viewTenantConfig` = owner + employee — el GET tiene que ser
   legible por employee porque `CreateReservation` (#12) lee los
   flags como employee. Backend: GET owner|employee (403 `'Owner or
   employee access required'`), PUT solo owner (403 `'Owner access
   required'`), admin cae en `tenantScope` → 403 `'Tenant scope
   required'` (resuelve el DoD "employee GET/PUT → … o según
   decisión").
10. Formatos RRule (decisión de implementación, verificados en BD):
    - schedule → `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,…` (orden canónico
      mon→sun sin duplicados; horas y breaks NO van en la RRule).
    - holiday recurrente → `RRULE:FREQ=YEARLY;BYMONTH=MM;BYMONTHDAY=DD`.
    - holiday puntual → `DTSTART;VALUE=DATE:YYYYMMDD` (iCal DATE,
      no es RRULE).

### Backend

- **VOs nuevos:** `TenantSettings` con doble construcción —
  `create()` estricta (PUT; mensajes aptos para 400) y `from()`
  tolerante (GET/reconstitute: `{}` → defaults, y cada campo
  inválido cae en su default sin tirar el objeto);
  `ScheduleBlock.create()` valida label/days/`HH:MM`/start<end/breaks
  (dedupe + orden canónico de días) y regenera la rrule;
  `Holiday.create()` valida label/fecha real de calendario/recurring
  booleano y regenera su rrule. `ScheduleBlock.parse`/`Holiday.parse`
  validan el array completo (`schedules must be an array`, etc.).
- **Entity `Tenant`:** `reconstitute` (lectura: name/currency/
  timezone estrictos, settings tolerante, schedules/holidays
  validados → fila corrupta = throw/500, nunca datos silenciosos;
  `null` en schedules/holidays → `[]`) + `withConfig` (escritura
  estricta todo-o-nada con `updatedAt` nuevo) + `toConfigRecord()`
  (JSON saneado para el repo). Helpers exportados:
  `CURRENCIES`, `isValidTimeZone`, `normalizeName/Currency/TimeZone`.
- **Repositorio:** `ITenantRepository` **conserva**
  `TenantSettingsRecord { settings: unknown }` sin cambios —
  `FindOrCreateClient`/`BookingSettings` leen keys raw y no deben
  pasar por el VO; se añaden `TenantFullRecord`, `findByIdFull` y
  `saveConfig` (un solo `update` con los 6 campos + `select` fijo).
- **Use cases:** `GetTenantConfigUseCase` (`'Tenant not found'`) y
  `UpdateTenantConfigUseCase` (lee → `withConfig` → `saveConfig` →
  bitácora `update_tenant_config` con metadata name/currency/
  timezone/slotDuration/counts; error de validación = 400 + 0
  escrituras).
- **Rutas** `/tenants/me` en `routes.ts` (bloque propio, tras
  reservations): `tenantScope` + guard de rol inline;
  `tenantConfigResponse` devuelve `settings` saneado,
  `schedules`/`holidays` con su `rrule`. Mapeo de errores: 404
  `'Tenant not found'`, 400 validación (PUT), 500 el resto (GET).
- **Seed:** `tenant-demo` gana 2 schedules (semana mon-fri
  09:00-18:00 break 13:00-14:00; sábado 10:00-14:00) y 2 holidays
  (Navidad 2026-12-25 recurrente; Puente local 2026-10-12 puntual)
  con rrule generada importando `dayMaster`, aplicados también en el
  `update` del upsert (idempotente al re-seedear).

### Frontend

- `roleConfig`: + `viewTenantConfig` (owner+employee) y
  `editTenantConfig` (solo owner); admin/client F/F; matriz de test
  actualizada.
- Nav `Layout`: item **Tenant Config** (`/tenant-config`, icono
  `tune`) gated por `editTenantConfig`; ruta nueva en `App`.
- **Página `TenantConfig.tsx`:** 4 fieldsets — Profile
  (name/currency/timezone con `datalist` de 12 zonas IANA), Booking
  settings (slot/max/retención/idioma/flags), editor visual de
  Schedules (checkbox de días, `time`, breaks con add/remove,
  quitar bloque) y editor de Holidays (label/date/recurring,
  add/remove) — con **validación doble**: las reglas #11 se
  comprueban localmente antes del PUT (mensaje en `role="alert"`);
  la autoridad sigue siendo el backend. Cambiar `slotDuration`
  re-calcula `maxServiceDuration` si dejó de ser múltiplo.
- **`CreateReservation` (#12):** los flags phone/email dejan de
  estar hardcodeados — `GET /tenants/me` en el mismo `useEffect`
  (defaults phone=true/email=false si el tenant no responde) y
  `required` + label `Phone (required|optional)` según el tenant.
  Espejo del backend, que ya leía los settings desde F3.3.
- `api/client`: TTL 60 s para `/tenants/me` + invalidación en
  mutaciones.

### Tests nuevos

Backend (+94): `tests/unit/domain/utils/dayMaster.test.ts`,
`tests/unit/domain/value-objects/{TenantSettings,ScheduleBlock,
Holiday}.test.ts`, `tests/unit/domain/entities/Tenant.test.ts`,
`tests/unit/application/use-cases/tenants/{GetTenantConfig,
UpdateTenantConfig}UseCase.test.ts` e integración
`tests/integration/api/v1/tenants.test.ts` (GET por roles +
aislamiento cross-tenant + 404 con tenant fantasma; PUT owner/
employee/admin; 4×400 sin tocar la BD; bitácora). Frontend (+13):
`TenantConfig.test.tsx` (carga, PUT payload exacto, 3 validaciones
locales sin PUT, error 400 del backend, editors de schedules/breaks/
holidays, gating employee/admin) + 2 tests de flags #12 en
CreateReservation + matriz `roleConfig`.

### Verificación curl DoD (2026-09-29)

- `GET /tenants/me`: owner → 200 (settings saneados + rrules del
  seed), employee → 200, admin → 403 `Tenant scope required`,
  sin token → 401.
- `PUT` válido → 200; rrules nuevas (`RRULE:FREQ=WEEKLY;BYDAY=TU,TH`
  y `DTSTART;VALUE=DATE:20270315`) verificadas **en la BD por psql**;
  bitácora `update_tenant_config` con metadata.
- 400 sin tocar la BD: `slotDuration:20`, timezone `Not/AZone`,
  schedule `start 18:00 > end 09:00`, holiday `2026-02-31` — cada
  uno con su mensaje y el tenant intacto.
- `PUT` employee → 403 `Owner access required` (decisión #9).
- Limpieza: BD restaurada con `db:seed`, bitácora de curl borrada,
  backend parado por PID (npm + hijo node), puerto 3000 libre.

### Deuda nueva / abierta

- `defaultLanguage` se almacena/valida pero **nadie lo consume**
  (i18n en SF8); espejo de `defaultLanguage` en el frontend.
- `slug` se devuelve en GET pero no es editable (perfil F5+ si se
  decide).
- La RRule almacenada no la lee nadie todavía: F4 la usará en el
  motor de disponibilidad junto a `TimezoneService` (horarios +
  breaks → huecos).
- `TenantSettings.from()` tolerante oculta settings corruptos en el
  GET (silencioso, no-bloqueante); si se quiere diagnóstico, añadir
  un warn en la reconstitución.
- El editor usa `datalist` de zonas comunes, no un selector
  completo; `customSchedule`/`customHolidays` de empleados (F3.2)
  siguen sin consumirse en reservas.

## F4 / F4.0 — Superadmin: superficie A + modo owner vía X-Tenant-Id (2026-09-29)

Rama `feature/f4-motor` (F3 cerrada y mergeada en `main`). Dos
superficies de administración sin tocar el schema ni el motor de
disponibilidad (F4.1+).

### Decisiones (F0, del usuario — no cuestionar)

1. **Superficie A** — rutas admin dedicadas bajo `/admin/tenants/*`
   con `authMiddleware` + `adminMiddleware` (reutilizado tal cual,
   DB lookup de rol). Lectura y escritura de CUALQUIER tenant, sin
   header extra.
2. **Superficie B** — rutas de zona tenant existentes (`/services`,
   `/employees`, `/reservations`, `/tenants/me`) con header
   `X-Tenant-Id: <tenantId>`: el admin "opera como owner" de ese
   tenant. `tenantScope` resuelve el scope y marca
   `req.isImpersonating`.
3. **POST /admin/tenants crea SOLO el tenant** (name, slug opcional,
   currency, timezone, settings/schedules/holidays) — **NO crea
   owner**. Los tenants creados no tienen owner hasta F4.1+; el admin
   los gestiona con el modo owner. El seed sigue creando
   tenants+owners demo. Slug: opcional, `lower + ^[a-z0-9-]+$`,
   unicidad → 409.
4. **Soft delete**: `PATCH /admin/tenants/:tenantId/active`
   `{isActive:boolean}` — no borra datos; acción `delete_tenant`.
5. **Bitácora** (acciones F0 #13/#15):
   - Superficie A → `Bitacora.tenantId = :tenantId` con actions
     `create_tenant` (tenantId **null**, es acción de plataforma),
     `update_tenant`, `delete_tenant`.
   - Superficie B → `metadata['admin-as-owner'] = tenantId` (y
     `tenantId` si el use case no lo traía) — inyectado de forma
     transversal, sin tocar los use cases (ver Backend #1).
6. **Guards de `/tenants/me` ampliados**: GET acepta
   `owner|employee|isImpersonating`; PUT acepta
   `owner|isImpersonating`. admin **sin** header sigue 403 antes
   (tenantScope).
7. **`roleConfig` no cambia**: el permiso `adminPanel` existente ya
   cubre el panel; el guard real es `AdminGuard` (`isAdmin()` de
   UserContext) en App. No se añadió permiso nuevo.
8. **`ListEmployeesUseCase`**: `includeInactive` ahora lo honra
   también `requesterRole === 'admin'` (supervisión desde la
   superficie A); para owner/employee no cambia nada.

### Backend

- **`requestContext.ts`** — el store ALS gana
  `impersonationTenantId` + `setImpersonationTenantId()` /
  `getImpersonationTenantId()`. El store es por-request (ya creado
  por `requestContextMiddleware` antes del router).
- **`BitacoraService.log`** — lee el ALS: si hay impersonación,
  enriquece el evento con `tenantId` (solo si venía vacío — un
  tenantId explícito del use case tiene prioridad) y
  `metadata['admin-as-owner']`. Así TODOS los use cases de zona
  tenant quedan marcados sin tocarlos (F0 #14/#12).
- **`Bitacora`** (entity) + `BitacoraEvent` + `PrismaBitacoraRepository`
  — campo `tenantId` (la columna ya existía en schema desde F2 pero
  nunca se escribía). La entity lo expone en el response de
  `GET /admin/bitacora`.
- **`tenantScope`** (ahora async) — admin+`X-Tenant-Id`:
  valida existencia del tenant con `prisma.tenant.findUnique`
  (404 si no existe; **inactivo se permite**, para poder supervisar
  un tenant en soft delete) → `req.tenantId` + `isImpersonating` +
  marca ALS. Admin sin header → 403 (igual que antes). Owner /
  employee / service → el header se ignora, manda el token.
- **`ITenantRepository`** — nuevos `findAllSummaries()`,
  `findBySlug()`, `create()`, `updateActive()` (+ records
  `TenantSummaryRecord` y `CreateTenantRecord`).
- **`use-cases/admin/`** (nuevo) — `ListTenantsUseCase`,
  `GetTenantUseCase`, `CreateTenantUseCase` (valida todo vía
  `Tenant.reconstitute`; id `genUUID('ten')`),
  `UpdateTenantUseCase` (mismo contrato que PUT /tenants/me pero
  action `update_tenant` con tenantId), `SetTenantActiveUseCase`
  (false → `delete_tenant`, true → `update_tenant` con
  metadata `isActive`).
- **`routes.ts`** — bloque `GET/POST /admin/tenants`,
  `GET/PUT /admin/tenants/:tenantId`,
  `PATCH /admin/tenants/:tenantId/active` y lecturas
  `GET .../{services,employees,reservations}` (reusan los List*
  use cases; validan existencia con `findById` sin parsear config
  para no 500 por filas corruptas en una lectura). Errors:
  404 not found / 409 slug dup / 400 resto
  (`adminTenantErrorStatus`). `GET /admin/bitacora` gana el query
  `adminAsOwner=<tenantId>|any` (Prisma jsonb `path` filter:
  equals / `not: AnyNull`).

### Frontend

- **`api/client.ts`** — `setImpersonationTenantId()` module-level;
  el request interceptor añade `X-Tenant-Id` solo en URLs de zona
  tenant (`/services|/employees|/reservations|/tenants/me`). El
  **cache GET se aísla por tenant** (`url@tenantId`) — sin esto,
  cambiar de tenant en modo owner serviría la respuesta cacheada
  del anterior. La invalidación por patrón (`invalidateByPattern`)
  sigue cubriendo las claves con sufijo.
- **`context/AdminTenantContext.tsx`** — `tenantId`, `ownerMode`,
  `enterOwnerMode()`, `exitOwnerMode()` (este último limpia el
  header). Montado en App tras UserProvider; el guard de rol es
  `AdminGuard`.
- **`components/Layout.tsx`** — banner "Operating as owner of tenant
  X" + botón Exit (vuelve a `/admin/tenants/:id`) cuando
  `ownerMode`.
- **Páginas** `pages/admin/AdminTenants.tsx` (lista con badges
  active/inactive y link al detalle) y
  `pages/admin/AdminTenantDetail.tsx` (form name/currency/timezone/
  settings con validación de maxServiceDuration múltiplo del slot;
  schedules/holidays en **round-trip** — su editor visual vive en
  TenantConfig, modo owner; toggle active; secciones de solo
  lectura de services/employees/reservations; botón
  "Operate as owner" → `enterOwnerMode` + navega a
  `/tenant-config`).
- **`AdminSubNav`** — pestaña "Tenants" (y `startsWith` para que
  el detalle marque el tab activo); ruta index de `/admin` ahora
  `/admin/tenants`.
- **`BitacoraPage`** — badge `[AS OWNER]` (ámbar, uppercase) junto
  a la acción cuando `metadata['admin-as-owner']` existe;
  `ACTION_OPTIONS` += `create_tenant`, `update_tenant`,
  `delete_tenant`, `update_tenant_config`; interfaz += `tenantId`.

### Tests (895 total: 582 backend + 104 front + 30 orch + 179 int.)

- Unit backend (+57): `middleware/tenant.test.ts` (reescrito, 9
  casos async + impersonación), `logging/BitacoraService.test.ts`
  (5, enriquecimiento ALS con `requestContextMiddleware` real),
  `use-cases/admin/*` (5 ficheros, 17 tests).
- Integración `admin.test.ts` (30): superficie A completa, surface
  B, permisos, bitácora `admin-as-owner` (query por tenant y `any`,
  y que `create_tenant` NO la lleva).
- Front (+17): `api/client.test.ts` (7 — header, zonas, aislamiento
  de cache), `AdminTenants.test.tsx` (4),
  `AdminTenantDetail.test.tsx` (6). Nota jsdom: `fireEvent.click`
  en un submit no dispara el submit con forms multi-campo → usar
  `fireEvent.submit(form)`.
- `Layout.test.tsx` mockea `AdminTenantContext` (Layout ahora
  depende de él).
- tsc: backend 0, frontend 0.

### Curl DoD (verificado con backend real, después de seed)

- Admin: lista 200, detalle 200 (2 schedules), POST 201
  (`ten-…`, defaults EUR/UTC), slug dup 409, name vacío 400,
  PUT 200 (maxServiceDuration 180→240), PATCH active 200
  (false/true), sin isActive 400, lecturas resources 200
  (ghost 404).
- Superficie B: admin+header GET /services 200, POST /services
  201 (tenantId tenant-demo), GET /tenants/me 200, PUT
  /tenants/me 200; admin sin header 403, header ghost 404,
  employee+header 200 (ignora header).
- Permisos: owner GET /admin/tenants 403, owner bitácora 403.
- Bitácora: `adminAsOwner=tenant-demo` → `create_service` +
  `update_tenant_config` con `tenantId: tenant-demo` y metadata
  `admin-as-owner`; `adminAsOwner=any` → esas 2; acciones
  superficie A → `create_tenant` con tenantId null,
  `update_tenant`/`delete_tenant` con tenantId propio y SIN
  admin-as-owner.
- Limpieza: backend parado por PID (npm 153102 + node 153138,
  puerto 3000 libre), curl-tenant/servicio/bitácora borrados de la
  BD dev, `db:seed` restauró tenant-demo.

### Deuda nueva / abierta

- **Creación de tenants sin owner** — hasta F4.1+ decidir el modelo
  (A: admin crea user+role desde la UI; B: primer registro del
  tenant se autodesigna owner; C: invitación por email). Mientras,
  los tenants creados por la superficie A solo son gestionables en
  modo owner.
- El motor de disponibilidad (F4.1), el booking público (F5) y la
  edición visual de schedules/holidays en la superficie A (hoy
  round-trip; se editan en modo owner vía TenantConfig) quedan
  pendientes.
- `POST /admin/tenants` usa `TenantSettings.from()` (tolerante,
  mismos defaults) en vez de `create()` estricto — mismo
  comportamiento silencioso que la deuda F3.4 de settings.
- El header `X-Tenant-Id` **no valida rol en el cliente** (client no
  conoce el usuario): la política vive en que solo
  `AdminTenantContext` (tras `AdminGuard`) lo setea.
- `adminAsOwner=any` usa `Prisma.AnyNull` sobre path jsonb; si
  alguna versión futura lo deprecá, fallback a `$queryRaw`.
- Los tenants en soft delete son legibles/editables por admin y por
  su owner con header (tenantScope no filtra `isActive`) — decidir
  si F4.1+ debe bloquear escrituras de zona tenant en tenants
  inactivos.

## F4 / F4.1a — Motor de disponibilidad (backend) (2026-09-30)

Rama `feature/f4-motor` (tras F4.0, `c320a7c`). Endpoint
`GET /api/v1/availability` con `tenantScope` + motor puro de slots
libres. Sin tocar schema ni frontend (F4.1b).

### Decisiones (F0, del usuario — no cuestionar)

1. **Fuente de verdad: bloque estructurado** (`tenant.schedules`,
   `employee.customSchedule`, `tenant.holidays`,
   `employee.customHolidays`) — la RRULE se ignora (es derivada).
2. **Algoritmo**: horario efectivo → bloques del día → festivos →
   breaks → slots de `slotDuration` → menos reservas activas
   (`pending|confirmed`) del empleado → `startUTC/endUTC` en UTC y
   `localStart/localEnd` (`HH:MM`) en la tz del tenant.
3. **TZ**: slots mostrados en tz del tenant; el frontend no convierte.
4. **Paginación sin cursor**: `from = nextFrom` (último slot + 1 min);
   el backend recalcula. `limit` default `settings.availabilityBatchSize`
   (máx 50).
5. **3 modos**: ASAP (sin from/to → `now` → `now + advanceBookingLimit`
   días), desde fecha (from sin to), rango (from+to). **`to` sin
   `from` → 400.**
6. **Settings nuevos (JSON, sin schema)**: `advanceBookingLimit` (30,
   owner-editable, máx 365), `availabilityBatchSize` (10, **NO
   owner-editable**), `allowCustomerAssignment` (true, para F5).
7. **Filtrado de `availabilityBatchSize` en el use case del owner**
   (`UpdateTenantConfigUseCase`), no en el VO: se conserva el valor
   almacenado (o se omite → default). El admin
   (`UpdateTenantUseCase`) sí lo edita y valida estricto.

### Backend

- **`domain/utils/TimezoneService.ts`** — cero dependencias nuevas:
  `  Intl.DateTimeFormat` nativo con el truco de offset (formatear el
  instante en la zona y reinterpretarlo como UTC) + 2 iteraciones
  para DST. API: `isValidTimeZone`, `getTimeZoneOffsetMs`,
  `convertToUTC` (local `YYYY-MM-DDTHH:MM[SS]` → `Date`),
  `convertFromUTC`, `formatForDisplay`, `localDateString`,
  `generateTimeSlots`. Validado para Europe/Madrid y America/New_York
  (spring-forward y fall-back) en tests.
- **`domain/services/ScheduleCalculator.ts`** — motor puro
  (`ScheduleCalculator.compute(input)`). Marcas candidatas =
  múltiplos de `slotDuration` desde **medianoche local** del día (no
  desde `from`/`now`, así la paginación es estable); pertenencia a
  ventanas limpias (bloque − breaks, recortado al rango), filtrado
  `startUTC > now` (estricto) y solapes con `busy`.
- **`GetAvailabilityUseCase`** (reservations) — valida `duration`
  (múltiplo de `slotDuration` → 400), `limit` (1..50), `to` requiere
  `from`; horizon = `now + advanceBookingLimit` recorta el `to`
  siempre; employee por `tenantId` (404 si ajeno); employee inactivo
  → `{slots: [], hasMore: false}`; devuelve
  `{slots, hasMore, nextFrom?}`.
- **Resolución de customSchedule** (decisión, no hay columna
  `useGlobalSchedule`): `customSchedule == null` ⇒ horario del
  tenant; formas aceptadas array o `{blocks:[...]}` (F3.2 almacena
  objeto JSON, no array) — shape desconocido → 400; `{}` ⇒ sin
  custom. Mismo criterio para `customHolidays` ({`holidays`}), que se
  **suma** a los del tenant.
- **`IReservationRepository.findActiveRanges(tenantId, employeeId,
  fromUTC, toUTC)`** — solo `{start,end}` de activas que solapan el
  rango (sin relaciones, sin N+1).
- **`GET /availability`** (routes.ts, con `tenantScope`) +
  `availabilityErrorStatus`: `not found` → 404;
  `required|must|requires|invalid` → 400; resto → 500.
- **`TenantSettings`** +3 campos con validación estricta en `create()`
  y tolerante en `from()` (legados `{}` → defaults).

### Tests (DoD)

- Nuevos: `tests/unit/domain/utils/TimezoneService.test.ts` (16),
  `tests/unit/domain/services/ScheduleCalculator.test.ts` (15),
  `GetAvailabilityUseCase.test.ts` (20),
  `tests/integration/api/v1/availability.test.ts` (12) = 63;
  ampliados: `TenantSettings.test.ts` (+4),
  `UpdateTenantConfigUseCase.test.ts` (+2, filtro owner),
  `UpdateTenantUseCase.test.ts` (+2, admin sí edita) y `Tenant.test.ts`
  (defaults nuevos). Total **+71**.
- `npm test` **653/653** (base 582 + 71); `test:front` 104/104; tsc
  backend **0**; frontend `tsc -b` **0**.
- Curl DoD (backend real, seed): ASAP 200 ✓, `from=2026-10-15` 200 ✓,
  rango 200 ✓, `to` sin `from` 400 ✓, `duration=17` 400 ✓,
  paginación 10 → `nextFrom=11:16` → 10 más desde 11:30 ✓ (sin
  solapes ni huecos), reserva `res-demo-1` (10:00-10:30) ocupa
  09:45/10:00/10:15 y deja 10:30 ✓, pasados no aparecen ✓, admin
  403 ✓. BD intacta (solo lecturas), backend parado por PID,
  worktree limpio.

### Deuda nueva / abierta

- **`CreateReservation` no valida aún `advanceBookingLimit`** (ni
  `bufferBetweenBookings`): el motor es solo de lectura en F4.1a.
- **`availability_cache`** (fuera de v1) queda pendiente; también
  recordatorios (F5+). El **multi-servicio** previsto aquí (la
  numeración "F4.2" acabó siendo el error handling global) se entregó
  en **F4.5a** (disponibilidad) + **F4.5b** (creación/cancelación de
  grupos).
- **Límites de TZ**: en el fall-back la hora repetida puede producir
  dos instantes distintos con el mismo `HH:MM` (afecta solo a bloques
  que crucen 02:00-03:00); en el spring-forward una hora local
  inexistente se desplaza. Bloques de horario laboral estándar no se
  ven afectados. Sin librería de fechas no se resuelve la ambigüedad
  de la hora repetida.
- `employee.customSchedule` sigue sin validación de shape al
  escribir (F3.2) — el motor valida al leer y devuelve 400 con
  mensaje claro; considerar validación al guardar en F4.1b/F5.
- `to` date-only se interpreta como **día exclusivo** (fin =
  medianoche local de `to+1`); `from` date-only = medianoche local
  de ese día.

## F4 / F4.1b — UI de disponibilidad (frontend) (2026-09-30)

Rama `feature/f4-motor` (tras F4.1a, `ffd32ce`). El formulario de
alta deja de aceptar "hora inventada": la hora se elige de un slot
de `GET /availability`. Sin tocar backend ni otras páginas.

### Decisiones (F0, del usuario — no cuestionar)

1. **Toggle "Lo antes posible" / "Elegir fecha"** — default ASAP.
   ASAP pide sin `from/to` (el backend parte de `now`); la fecha
   manda `from=to=YYYY-MM-DD`.
2. **Slot obligatorio** — sin slot seleccionado → error local
   `Selecciona un slot disponible.` (no se llega al POST).
3. **Paginación "Cargar más"** — `from=nextFrom` del backend y
   `to=date` solo en modo fecha; el botón desaparece con
   `hasMore=false`; cambiar servicio/empleado/fecha/toggle resetea
   lista, selección y paginación (efecto + `seqRef` anti-carreras).
4. **TZ** — `localStart/localEnd` ya llegan en tz del tenant (el
   frontend no convierte). El `date` del POST se calcula con
   `tenantDateKey(startUTC, timezone)` (Intl, locale `en-CA`) sobre
   la tz de `GET /tenants/me`, **no** la del navegador.
5. **`/availability` sin cache** (TTL 0): la disponibilidad cambia
   con cada reserva y `nextFrom` varía por tanda. Sí entra en
   `TENANT_ZONE_PATTERNS` (header `X-Tenant-Id` al impersonar).

### Frontend

- **`components/SlotPicker.tsx`** (nuevo): agrupa los slots por
  clave de día vía `dayKeyOf`, slot botón con `aria-pressed`
  (selección) y callback `onSelect`, mensaje de vacío propio,
  `Cargando...` y botón `Cargar más` (solo `hasMore && !loading`).
- **`pages/CreateReservation.tsx`**: quita los inputs date+time y
  la fecha local del navegador; añade toggle + date picker
  condicional + sección "Horarios disponibles" (solo si hay
  empleado+servicio+(fecha si el modo la exige); fetch de la página
  1 en efecto, `handleLoadMore` aparte, validación de slot antes del
  POST. Requiere verificación visual: mueve los tests de creación
  fuera de `Reservations.test.tsx`.
- **`utils/booking.ts`**: `tenantDateKey(iso, timeZone)` —
  `YYYY-MM-DD` en la tz dada; fallback al día UTC si la tz es
  inválida/vacía.
- **`api/client.ts`**: `/availability` con TTL 0 (request solo lee
  caché si `ttl>0`; response solo escribe si `ttl>0`) +
  `TENANT_ZONE_PATTERNS`.

### Tests (DoD)

- Nuevos: `components/SlotPicker.test.tsx` (7),
  `pages/CreateReservation.test.tsx` (11 — los 4 tests de creación
  venían de `Reservations.test.tsx`, adaptados a slots, + ASAP con
  params exactos, date=tenant, validación, toggle, cargar más,
  vacío, error availability, admin/employee), `client.test.ts` (+2:
  header en `/availability` y TTL 0). Total **+16**.
- `test:front` **120/120** (base 104); `npx tsc -b` **0**; backend
  `tsc` **0**; `npm test` **653/653** sin regresión.
- Prueba manual en navegador (script Playwright con Chrome del
  sistema — el chromium cacheado no coincide con playwright 1.63 —,
  **12/12 checks**: default ASAP + 10 slots; selección
  `aria-pressed`; guardar → redirige y `startTimeUTC` = primer slot
  de `/availability` y `date` = día tenant; fecha → slots agrupados
  bajo `YYYY-MM-DD` con query `from/to`; cargar más 10 → 20 con
  `from=nextFrom`; domingo → mensaje vacío sin cargar más).
  Backend+frontend arrancados para la prueba y parados por PID
  (puertos 3000/5173 libres); BD no se tocó.

### Deuda nueva / abierta

- **i18n**: los strings nuevos siguen el texto del spec (español:
  toggle, `Cargar más`, vacío, validación) mientras el resto del
  formulario está en inglés (el login ya mezclaba) — candidatos a
  localización con el resto de la UI.
- **Tiempo real** (¿polling/WebSocket para refrescar slots ocupados?
  F5+) sigue abierto; `availability_cache` queda fuera de v1. El
  **multi-servicio** previsto aquí (numeración "F4.2", reasignada al
  error handling) se entregó en F4.5a/F4.5b — la UI sigue pendiente
  en F4.5d.
- El fetch de disponibilidad no tiene `AbortController`: la
  protección es por `seqRef` (descarta respuestas obsoletas), no
  cancela la petición en curso.
- La validación de `advanceBookingLimit`/`bufferBetweenBookings` en
  `CreateReservation` sigue pendiente (deuda de F4.1a): ahora el
  servidor rechazará los slots fuera de horario con el error del
  backend.

## F4 / F4.2 — Error handling global (2026-09-30)

Rama `feature/f4-motor` (tras F4.1b, `6aa9096`). Módulo de errores
portable + handler global + migración gradual de las rutas críticas.
Envelope único `{ "error": { "code": "...", "message": "..." } }`,
**sin compatibilidad con el viejo** `{ "error": "message" }`.

### Decisiones (F0, del usuario — no cuestionar)

1. **Módulo genérico** en `backend/src/infrastructure/errors/`:
   `AppError` (base, `code` + `status` + `message`, `this.name` vía
   `new.target`) y subclases `NotFoundError` (404/NOT_FOUND),
   `ValidationError` (400/VALIDATION_ERROR), `UnauthorizedError`
   (401/UNAUTHORIZED), `ForbiddenError` (403/FORBIDDEN),
   `ConflictError` (409/CONFLICT), `InternalError` (500/INTERNAL_ERROR).
   Firmas: `constructor(message, code = DEFAULT)` — message primero,
   code de dominio opcional.
2. **Códigos**: genéricos en `codes.ts` (portables al starter, S8);
   dominio MR en `mr-codes.ts` (`RESERVATION_NOT_FOUND`,
   `RESERVATION_OVERLAP`, `RESERVATION_INVALID_STATE`,
   `DATE_START_TIME_MISMATCH`, `SERVICE_NOT_FOUND`,
   `EMPLOYEE_NOT_FOUND`, `TENANT_NOT_FOUND`, `CONFIG_NOT_FOUND`,
   `SLUG_ALREADY_EXISTS`) — **NO se portan**.
3. **`errorHandler`** montado en `index.ts` al final, tras todas las
   rutas. Algoritmo: `res.headersSent` → `next(err)`; `AppError` →
   tal cual (4xx exponen su message); error crudo con status 4xx
   (body-parser: JSON malformado…) → ese status + `VALIDATION_ERROR`
   + su message (JSON, nunca HTML); resto → 500 `INTERNAL_ERROR` +
   `"Internal server error"` genérico (el detalle `err`+stack va al
   log con `getRequestId()`: `logger.error` en 5xx, `logger.warn` en
   4xx).

### Migración gradual (qué se migró / qué no)

Se migró (rutas sin try/catch — Express 5 auto-forwarda rechazos
async al handler; use cases lanzan subclases):

- **Auth**: `LoginUseCase` — `Email and password are required` →
  `ValidationError` (**400**, antes 401: cambio intencionado del
  spec); `Invalid credentials` / `Demo mode is disabled` /
  `Invalid demo role` → `UnauthorizedError` (401).
- **Reservations**: create/get/list/update/cancel (+ cancel por
  token) y `FindOrCreateClientUseCase`. Códigos: 404
  `RESERVATION_NOT_FOUND`, 409 `RESERVATION_OVERLAP`,
  409 `RESERVATION_INVALID_STATE` (ya cancelada), 400
  `VALIDATION_ERROR` (refs, duration, status, past, phone…).
- **Services/Employees CRUD**: 404 `SERVICE_NOT_FOUND` /
  `EMPLOYEE_NOT_FOUND` (null o cross-tenant), 400
  `VALIDATION_ERROR` (VOs y refs); `Tenant not found` → 404
  `TENANT_NOT_FOUND` (paridad con el `message.includes('not found')`
  del catch viejo).
- **Tenants**: `GET/PUT /tenants/me` + admin (get/create/update/
  set-active). `slug already exists` → 409 `SLUG_ALREADY_EXISTS`;
  `isActive must be a boolean` → 400 `VALIDATION_ERROR`.
- **Config**: `GET /config/:key` + `PUT/PATCH/DELETE` → 404
  `CONFIG_NOT_FOUND`.
- **Middlewares** `auth`/`admin`/`tenantScope` → `next(new XxxError)`
  (401 UNAUTHORIZED, 403 FORBIDDEN, 404 TENANT_NOT_FOUND).
- **Guards de ruta** migrados: `Tenant scope required` →
  `ForbiddenError`, `Owner/Owner or employee access required` →
  `ForbiddenError`, `Unauthorized` → `UnauthorizedError`.

NO migrado (envelope viejo a propósito, "cuando se toque"): `users`,
`bitácora`, `events`, `files`, **`GET /availability`** (su
`availabilityErrorStatus` se conserva), listas admin de
resources/services/employees/reservations, rate limiter (429), y los
guards `if (!tenantId)` del propio availability.

### Estrategia de conversión de errores del dominio

Los entities/VOs del dominio lanzan `Error` plano (no AppError).
Donde esos throws son alcanzables desde datos del body, el use case
migrado **envuelve solo las llamadas síncronas** a la entity/VO en
try/catch → `ValidationError(message)` (con rethrow si ya es
`AppError`). Los throws directos de los use cases se convirtieron a
subclases con su código. Los errores de repo/infra NO se envuelven →
500 honesto con mensaje genérico (el catch viejo filtraba el mensaje
crudo, ej. un `PrismaClientValidationError`, en el 400/500).

### Deuda `DATE_START_TIME_MISMATCH`

`CreateReservationUseCase` valida ahora que `date` (YYYY-MM-DD) sea
el día calendario **local del tenant** de `startTimeUTC`
(`localDateString(startTimeUTC, tenant.timezone)`; zona del tenant =
datos fiables, no la `input.timezone` del body). Si no →
`ValidationError(message, DATE_START_TIME_MISMATCH)` 400. Antes la
incoherencia producía reservas "fantasma" (filtro `sameDay`/activeKey
miraba otro día). Orden: pattern → ISO → past → **mismatch** → refs.

### Frontend

`api/client.ts` interceptor de error: si `data.error` es objeto con
`code` → guarda `error.code = code` (para i18n/lógica por código en
F4.6; en el frontend no se leía `.code` antes, verificado) y
normaliza `data.error = message` (string), así los cinco
`apiError()` de páginas (`TenantConfig`, `ReservationDetail`,
`AdminTenant(s)`, `CreateReservation`) siguen funcionando sin cambios.

### Tests / verificación

- Nuevos: `tests/unit/infrastructure/errors/{AppError,errorHandler}.test.ts`
  (24 tests: subclases, envelope, no-leak 500, body-parser 4xx,
  headersSent) y `tests/integration/api/v1/errorHandler.test.ts`
  (8 E2E: 401/403/400/404/409, JSON malformado, 500 forzado con
  `employeeId: {…}` → Prisma → `INTERNAL_ERROR` genérico, y
  `DATE_START_TIME_MISMATCH`).
- Migrados a envelope nuevo: ~53 aserciones `res.body.error` en 8
  ficheros de integración + unit de `auth`/`tenant` middleware
  (pasan a `next(err)` con instancia). `login sin credenciales` pasa
  de 401 a 400 `VALIDATION_ERROR`.
- `npm test` **677/677**; backend `tsc --noEmit` 0;
  `test:front` **123/123** (+3 del interceptor); `tsc -b` 0.
- Curl manual DoD (backend dev por PID, parado al terminar):
  404 `RESERVATION_NOT_FOUND` · 409 `RESERVATION_OVERLAP`
  (exacto y parcial) · 400 `VALIDATION_ERROR` · 500
  `INTERNAL_ERROR` "Internal server error" · JSON malformado → 400
  JSON `VALIDATION_ERROR` · `DATE_START_TIME_MISMATCH` con fecha
  desplazada. Envelope nuevo también en 401/403.

### Portabilidad (S8)

Portable al starter: `AppError.ts`, `errors/*` (subclases),
`codes.ts`, `errorHandler.ts`, `index.ts`. NO portable: `mr-codes.ts`
ni ninguna de las llamadas con códigos MR. El handler solo depende
de `express` + `logging/logger` + `requestContext.getRequestId`.

## F4 / F4.3 — Agenda visual con FullCalendar (2026-10-01)

**Decisiones F0 (no cuestionables):** FullCalendar con wrapper
`@fullcalendar/react`; `timeGridWeek` por defecto; `timeGrid` free
(sin `resourceTimeGrid` premium, colores por empleado); página nueva
`/agenda` (la lista `/reservations` sigue siendo tabla); sin
drag&drop en v1 (solo ver, click → detalle); selector de empleado
(default: todos); fondo = horario con la RRULE de F3.4; reservas
activas por defecto con filtro opcional de canceladas; refetch
cuando cambia el rango visible.

### Implementación

- **Dependencias** (`frontend/package.json`): `@fullcalendar/react`
  + `@fullcalendar/core`, `daygrid`, `timegrid`, `interaction` y
  `rrule`, todas **6.1.21**. *Cuidado:* sin fijar versión, npm
  instala `@fullcalendar/react@7` que rompe el peer con `core@6`.
  El CSS se auto-inyecta en v6 — no hay import de CSS.
- **Página `frontend/src/pages/Agenda.tsx`**:
  - `<FullCalendar>` con `initialView="timeGridWeek"`,
    `firstDay={1}`, `editable={false}`/`selectable={false}` (F0 #5),
    `nowIndicator`, `height="auto"`.
  - **Eventos** = reservas: `start/end` desde `startTimeUTC`
    (`endTimeUTC`), color por empleado (paleta fija de 8 por orden
    del selector; `#94a3b8` para canceladas), título
    `cliente · servicio`.
  - **Fondo** = bloques de horario con `display: 'background'` y la
    RRULE de F3.4 (`block.rrule`; si un `customSchedule` crudo no
    la trae, se deriva de `days` con el mismo formato
    `RRULE:FREQ=WEEKLY;BYDAY=…`). El plugin `@fullcalendar/rrule`
    expande `DTSTART:<ancla>T<HHMMSS>` + `RRULE:` y el `duration`
    (`'H:MM'`) marca el fin del bloque. El ancla (lunes fijo
    2026-01-05) solo aporta la hora: los días los gobierna `BYDAY`.
  - **Horario efectivo** (criterio F4.1a): `customSchedule` del
    empleado seleccionado si tiene bloques válidos; si no (o "All
    employees"), `schedules` del tenant vía `GET /tenants/me`. El
    background es *best-effort*: si `/tenants/me` falla, la agenda
    sigue funcionando sin bandas.
  - **Filtros**: selector de empleado → `employeeId` en la query
    (refetch); checkbox "Include cancelled" → filtro en cliente
    (por defecto solo `pending|confirmed`, F0 #8).
  - **Refetch por rango (F0 #10)**: `datesSet` →
    `GET /reservations?from&to&employeeId&limit=200`; el state
    `range` solo se actualiza si cambian los valores (evita
    refetch en cada render de FullCalendar).
  - **Click** → `navigate('/reservations/:id')`; los eventos de
    fondo (ids `schedule-*`) no navegan.
- **Backend**: `GET /reservations` acepta `from`/`to`
  (`YYYY-MM-DD`, ambos inclusivos sobre el día calendario;
  `date` exacto tiene prioridad). `ListReservationsUseCase` valida
  formato y `from <= to` (400 `VALIDATION_ERROR`);
  `PrismaReservationRepository` filtra `date: { gte, lte }`. Las
  relaciones (`client`, `employee`, `service`) ya venían
  incluidas (`ReservationWithRelations`).
- **Ruta/navegación**: `/agenda` en `App.tsx`; link "Agenda" en
  `Layout.tsx` con `permission: 'viewReservations'` (lo ven owner y
  employee; admin/client no).
- **`api/client.ts`**: sin cambios — la clave de caché ya incluye
  `params` (cada rango/ filtro es una entrada distinta) y
  `/reservations` tiene TTL 60 s + invalidación por mutación.

### Tests / verificación

- Frontend **128/128** (+5 en `Agenda.test.tsx`: render con
  eventos mock + banda de fondo + canceladas ocultas por defecto,
  selector → refetch con `employeeId`, click → detalle, cambio de
  semana → nuevo rango, checkbox de canceladas sin refetch).
  FullCalendar se stubea en jsdom; `npx tsc -b` 0.
- Backend **684/684** (+7: unit — passthrough `from/to`, rango
  abierto, formato inválido ×2, `from > to`; integración — rango
  inclusivo, fuera de rango y 400 por `from` inválido/invertido).
  `npx tsc --noEmit` 0.
- Prueba manual (Playwright con Chrome del sistema; backend, vite
  y BD parados al terminar): login owner → `/agenda` → semana
  2026-09-28…10-04 con la reserva del 01/10 pintada en color de
  empleado, bandas "Horario semanal" (lun–vie 9–18) y "Sábado"
  (10–14) como fondo, botón siguiente semana → request
  `from=2026-10-05` y reserva del 07/10 visible, filtro de
  empleado → `employeeId` en la query, click en la reserva →
  `/reservations/:id`.

### Deuda (F4.4+)

- **Drag & drop / resize** para mover reservas (F0 #5: v1 solo
  ver). El plugin `interaction` ya está instalado; haría falta
  permiso `editReservations` + escritura en backend.
- **`resourceTimeGrid` (premium)** si se quiere columna por
  empleado (licencia FullCalendar); hoy lo distingue el color.
- **Vista mensual** (`dayGridMonth`; el plugin `daygrid` ya está).
- **Festivos como background** (RRULE anual de F3.4): en v1 solo
  se pinta el horario; los festivos no se descuentan ni se
  muestran en la agenda.
- **Breaks** de cada bloque: se pintan dentro de la banda (no se
  descuentan como en el motor de disponibilidad).
- **`limit=200`** por rango: una semana con más de 200 reservas
  trunca la respuesta (paginación o pedir día a día si hace falta).
- **`completed`/`no_show`** no se muestran (F0 #8 literal:
  activas por defecto + opcional canceladas).

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

## Logging unificado (deuda arquitectónica)

**Estado:** pendiente de decisión. Depende del modelo de despliegue
(monolito vs separado).

**Contexto:** el diseño original de MR preveía logging unificado
front + back + orquestador (visor en vivo, autorefresco). En
desarrollo (misma máquina) es viable con SSE/WebSocket. En producción
con componentes desplegados por separado, esa unificación hay que
ganarla de otra forma: los logs de cada componente van a sitios
distintos por defecto.

**Tres alternativas:**

### A) Backend como hub de logs (monolito)
- Frontend envía sus logs al backend vía HTTP (batch + `sendBeacon`).
- Backend los escribe junto a los suyos.
- El backend es el punto único de logs.
- **Pros:** cero infraestructura extra. El `ConfigManager` y el debug
  system (SSE `/admin/debug/live`) ya están en el backend.
- **Contras:** sin correlación automática con logs del backend (habría
  que añadir `traceId` manualmente). Si el frontend está caído, los
  logs se pierden.
- **Cuándo:** si MR se despliega como monolito (back + front + orch en
  el mismo servidor).

### B) Grafana Cloud Free (separado, gestionado)
- Cada componente envía logs a Loki (alojado por Grafana Labs) vía
  Grafana Alloy.
- Grafana Cloud: 50 GB/mes gratis, 14 días retención, 3 usuarios.
- **Pros:** verdadero logging unificado. Alertas con LogQL. Cero
  infraestructura a mantener.
- **Contras:** dependencia de un servicio externo. Límite de 50 GB/mes
  y 14 días de retención.
- **Cuándo:** si MR se despliega separado y no se quiere gestionar
  infraestructura.

### C) Loki OSS self-hosted (separado, control total)
- Mismo stack que B, pero Loki corre en infraestructura propia.
- **Pros:** sin límites de volumen ni retención. Residencia de datos.
- **Contras:** coste operativo real (VPS + mantenimiento de Loki +
  Grafana + Alloy + Alertmanager). Stack de 6+ componentes en
  producción.
- **Cuándo:** si se necesita retención larga, control total, o el
  volumen supera el free tier de Grafana Cloud de forma sostenida.

**Decisión:** pendiente. Se decide cuando el modelo de despliegue de
MR esté definido (monolito vs separado).

**Mientras tanto:** backend con `pino` (stdout + fichero), frontend
con `console`, orquestador con `logging`. No hay unificación real,
pero funciona para desarrollo.

**Recomendación para v1 (si se va a separado):** Grafana Cloud Free.
50 GB/mes es más que suficiente para un proyecto en desarrollo.
Migrar a Loki OSS es trivial si crece (misma API, mismo LogQL).

## Registro y verificación de tenants (F4.2+)

**Estado:** implementada en F4.4a (backend: registro, verify,
reenvío y bloqueo) + F4.4b (frontend: páginas de registro y
verificación).

**Modelo:** el **registro público** es el mecanismo principal para
crear tenants. El admin solo crea tenants excepcionalmente
(demos, migraciones, casos internos) y **sin owner** (decisión F4.0).

**Por qué:** el registro público elimina el flujo de "password
provisional + email + set password". El owner elige su password al
registrarse. El tenant nace con owner. No hay ventana de "tenant
sin owner".

### Flujo

1. **Registro** (`POST /auth/register`): filiación mínima — email,
   password, owner name, business name. Crea en una transacción:
   - `Tenant` (name, slug auto-generado, currency=EUR,
     timezone=UTC, `settings = { email_verification: { token,
     expiresAt } }`, schedules=[], holidays=[]).
   - `User` (email, password, name, role=owner, tenantId del tenant).
   - Email con link: `/tenant-config?token=<token>`.

2. **Primer login (pre-verificación):** login OK. La app muestra
   banner "confirma tu email". Las páginas de edición están
   bloqueadas.

3. **Click en el link del email:** el owner abre
   `/tenant-config?token=X`. El frontend, **antes de renderizar**,
   comprueba si el tenant tiene `settings.email_verification`:
   - **Key existe y hay token en la URL:** llama a
     `POST /tenants/verify-email { token }`.
   - **Key existe y no hay token:** muestra banner + botón
     "reenviar email".
   - **Key no existe:** renderiza el formulario (verificado).

4. **Verificación** (`POST /tenants/verify-email`): el backend
   valida el token contra `settings.email_verification` y, si es
   válido, **elimina la key** (`settings = {}`). Devuelve OK.

5. **Post-verificación:** el frontend recarga `GET /tenants/me` →
   sin la key → renderiza el formulario desbloqueado. El owner
   configura (o no). **El email ya está verificado.**

### Bloqueo

**Solo en las rutas de edición:**
- `PUT /tenants/me`
- `POST /services`
- `POST /employees`

**Condición:** si `settings.email_verification` existe → **403
`EMAIL_NOT_VERIFIED`**.

**Los GET no comprueban nada.** Los listados, las lecturas y las
reservas funcionan con normalidad.

**Bloqueo operativo (natural, no técnico):** sin servicios ni
empleados no hay nada que reservar. El backend lo rechaza
naturalmente (`serviceId does not reference...`,
`employeeId does not reference...`). No hay flag "operativo".

### Administración

- **Admin exento** del bloqueo técnico. El use-case decide no
  comprobar la key si `role === 'admin'`.
- **Tenants creados por admin/seed:** sin `email_verification` →
  verificados por defecto. Cero migración.

### Reenvío

`POST /auth/resend-verification` (autenticado): regenera el token
en la misma key y reenvía el email con el mismo link.

### Diseño

- **Token:** `Tenant.settings.email_verification = { token,
  expiresAt }`. La presencia de la key es el estado "no verificado".
  La ausencia es "verificado".
- **Endpoint dedicado** `POST /tenants/verify-email`. **No es un
  middleware ni un `GET` con efecto secundario** (un GET que escribe
  rompe el contrato REST y se consumiría por accidente desde
  cualquier componente).
- **El token solo viaja en la URL del link del email.** El frontend
  lo lee y lo envía al endpoint. **No hay `sessionStorage` ni ciclo
  de vida del token.**
- **Sin cambios de schema.** Se reutiliza `settings` (JSON) para el
  estado de verificación. No hace falta añadir columnas a `User`.

**Contrato:**
- `GET /tenants/me` devuelve `settings.emailVerified: boolean` (sin
  el token). El token **nunca** viaja al frontend.
- `POST /tenants/verify-email` recibe `{ token }`, valida, elimina la
  key y devuelve **el tenant completo** (mismo shape que
  `GET /tenants/me`).
- El frontend no compara tokens: si hay `param-token`, llama al POST;
  si no, y `emailVerified === false`, muestra banner.

### Deuda / decisiones aplazadas

- **Verificación obligatoria antes de operar:** sí. Sin verificar,
  el owner no puede configurar servicios/empleados. Es el diseño.
- **Caducidad del token:** 24h (fijado en F4.4a,
  `EMAIL_VERIFICATION_TTL_MS` en `application/use-cases/verification.ts`).
- **Verificación de email en registro:** sin doble opt-in (el click
  del email es la verificación).
- **Registro con invitación vs público:** público en v1. Añadir
  rate limiting + verificación. Si se necesita invitación (F5+),
  se añade un flag al registro.
- **Admin crea tenants con owner:** hoy solo crea el tenant
  (`POST /admin/tenants`); el registro público es el camino normal
  para tenant + owner (F4.4a).

### Implementación (F4.4a — backend)

Verificado: `npm test` 728/728, `npx tsc --noEmit` 0 errores, y la
lista DoD manual con curl (register 201+JWT, email duplicado 409
`USER_EMAIL_EXISTS`, password corta 400, `emailVerified:false`,
`POST /services` 403 `EMAIL_NOT_VERIFIED`, verify 200, token usado
400, resend 200, email en consola con provider `console`).

- **Endpoints:** `POST /auth/register` (público + `registerLimiter`
  5/h/IP en prod, 100 en dev/test — misma receta que `loginLimiter`),
  `POST /tenants/verify-email` y `POST /auth/resend-verification`
  (autenticados + `tenantScope`).
- **Registro:** password mínimo 8 caracteres; `RegisterUseCase`
  crea tenant + owner en **una transacción**
  (`ITenantRepository.createWithOwner`, array `prisma.$transaction`).
  Slug kebab-case auto (`domain/utils/slugify.ts`, fallback
  `tenant`) con sufijo `-2…-100` y luego aleatorio. Carreras de
  unicidad: pre-chequeo + mapeo de P2002 → 409
  (`email`→`USER_EMAIL_EXISTS`, `slug`→`SLUG_ALREADY_EXISTS`).
  Devuelve JWT auto-login (role `owner`) + user info.
- **Clave en el VO:** `settings.email_verification` vive en
  `TenantSettings` (getter `emailVerification`, `getValue()` la
  incluye solo si existe; `create()` la valida estricta, `from()`
  tolerante). `isValidEmailVerification` y `preserveEmailVerification`
  se exportan desde el VO.
- **Clave de sistema:** los PUT de owner (`UpdateTenantConfigUseCase`
  vía `filterOwnerSettings`) y de admin (`UpdateTenantUseCase`)
  **conservan** la clave previa: el payload no la inyecta ni la
  borra. Solo register/verify/resend la escriben.
- **Bloqueo:** `assertEmailVerified(settings, requester)` en
  `application/use-cases/verification.ts`, llamado por
  `UpdateTenantConfigUseCase`, `CreateServiceUseCase` y
  `CreateEmployeeUseCase` (este último ahora inyecta
  `ITenantRepository` y comprueba también 404 de tenant). **Admin
  exento** (`requester.role === 'admin'`, siempre con `X-Tenant-Id`).
  Los GET no comprueban nada.
- **Token:** `genToken(32)` (nanoid, alfabeto URL-safe), caducidad
  24h, comparación con `crypto.timingSafeEqual`. El token **nunca**
  sale en respuestas: `tenantConfigResponse` elimina la clave y
  expone `settings.emailVerified`.
- **Verify:** sin clave o token distinto → 400
  `EMAIL_VERIFICATION_INVALID_TOKEN`; caducado → 400
  `EMAIL_VERIFICATION_EXPIRED`; válido → elimina la clave (demás
  settings intactos) y devuelve el tenant completo.
- **Resend:** rota el token (nuevo `expiresAt` +24h) y reenvía al
  owner (`IUserRepository.findOwnerByTenantId`); si ya está
  verificado → no-op silencioso `{ sent: false }` (HTTP 200).
- **Email:** `EmailService.sendVerificationEmail(to, token)` → link
  `${FRONTEND_URL}/tenant-config?token=…` (24h de caducidad en el
  cuerpo), provider `console` por defecto.
- **Tests nuevos:** `RegisterUseCase.test`, `VerifyEmailUseCase.test`,
  `ResendVerificationUseCase.test`, ampliaciones en
  `TenantSettings.test`, `UpdateTenantConfigUseCase.test`,
  `CreateServiceUseCase.test`, `CreateEmployeeUseCase.test`,
  `emailService.test` y flujo completo en integración
  `auth.test.ts` (bloqueos, verify, caducado, admin exento).

## F4 / F4.4b — Registro + verificación de email (frontend) (2026-10-02)

**Estado:** implementada. Frontend 158/158 tests, `tsc -b` 0,
backend 728/728 sin regresión, flujo DoD verificado en navegador
(Playwright manual: registro → gating → token inválido → resend →
verify → dashboard sin banner).

**Páginas públicas (sin Layout):**

- **`Register`** (`/register`): email, password, ownerName,
  businessName. Validación local (email válido, password ≥ 8,
  campos obligatorios). `UserContext.register` →
  `POST /auth/register` + auto-login (guarda el JWT igual que
  `login`) → redirige a `/register/check-email?email=X` (NO a
  `/tenant-config`: la verificación va después). 409
  `USER_EMAIL_EXISTS` → "Ese email ya está registrado"; 400 → el
  `message` del backend.
- **`CheckEmail`** (`/register/check-email`): "Te hemos enviado un
  email a X". Botones "Reenviar email"
  (`POST /auth/resend-verification`, toast) y "Ya he verificado"
  (`GET /tenants/me` fresco → si `emailVerified` → `/tenant-config`,
  si no → "Aún no se ha verificado. Revisa tu email.").
- **Link "¿No tienes cuenta? Regístrate"** en el `LoginForm` (la
  ruta `/login` redirige a `/dashboard`, que renderiza el LoginForm
  cuando no hay sesión).

**TenantConfig (`/tenant-config?token=X`):**

- Si la URL trae `token` → `POST /tenants/verify-email { token }` y
  la respuesta (mismo shape que GET) puebla el formulario — **sin
  GET extra**. Tras el éxito se limpia el query param (`replace`) y
  se avisa con toast.
- Token inválido/caducado → alert con el error + fallback
  `GET /tenants/me` → banner.
- Sin token y `settings.emailVerified === false` → banner
  "Confirma tu email para editar tu configuración" + botón
  "Reenviar email".

**Gating local (defensa en profundidad — el 403 del backend es la
autoridad):**

- **Dashboard:** banner "Confirma tu email para empezar a usar
  MultiReservas" con link a `/tenant-config`.
- **Services / Employees:** banner "Confirma tu email para editar"
  con link a `/tenant-config`.
- **CreateService / CreateEmployee:** `<fieldset disabled>` + el
  mismo mensaje; `handleSubmit` también corta si `locked`.
- **Admin exento:** `useEmailVerified` devuelve `true` sin hacer
  fetch si `role === 'admin'`.
- **Sin banner global en `Layout`** (decisión F4.4b): solo en
  páginas relevantes (TenantConfig, Dashboard, edición).

**Mecánica del estado de verificación:**

- Hook `frontend/src/hooks/useEmailVerified.ts`: lee
  `settings.emailVerified` de `GET /tenants/me`.
- **Sin caché:** el GET lleva `params: { _t: Date.now() }` porque
  `client.ts` cachea `/tenants/me` 60s y **no** invalida tras
  `POST /tenants/verify-email` (invalidateByPattern solo mira
  `/tenants/me`). La clave de cache incluye los params → siempre
  fresh sin tocar `client.ts` (restricción F4.4b).
- **Por defecto verificado:** si el campo falta (tenants antiguos,
  mocks) o el fetch falla → `true`. Un falso bloqueo sería peor que
  no mostrar el banner.

### Tests

- Nuevos: `Register.test.tsx`, `CheckEmail.test.tsx`,
  `Dashboard.test.tsx`.
- Ampliados: `TenantConfig.test.tsx` (verify por token, token
  inválido, banner on/off), `Services.test.tsx` y
  `Employees.test.tsx` (banner + formularios deshabilitados),
  `UserContext.test.tsx` (register + auto-login),
  `LoginForm.test.tsx` (MemoryRouter + link de registro).

### Deuda / decisiones aplazadas

- **i18n:** textos de registro/check-email/banners en español
  (coherentes con `LoginForm`); el resto de páginas está en
  inglés. Unificar en F4.6 (SF8).
- **Invalidación real de `/tenants/me`:** tras verify, las lecturas
  con caché de `client.ts` (p.ej. flags de `CreateReservation`)
  pueden quedar obsoletas hasta 60s. Arreglarlo requiere tocar
  `client.ts` (fuera de alcance de F4.4b).
- **Verificación de email en registro:** sin doble opt-in; el click
  del link es la verificación (deuda común con F4.4a).

## F4 / F4.4c — "Sin preferencia" de empleado (2026-10-02)

**Estado:** implementada. Backend 752/752 (`tsc --noEmit` 0),
frontend 167/167 (`tsc -b` 0). DoD verificado en navegador (Playwright
manual contra backend en `:3100` + Vite en `:5174`, sin tocar el
`dev:all` en marcha): select arranca en "Sin preferencia" → huecos sin
`employeeId` y con el nombre del empleado en el slot → reserva creada
con empleado asignado por el backend → aviso de día sin huecos →
`allowCustomerAssignment=false` oculta el select (y se restaura).

**Backend:**

- `GET /availability`: `employeeId` pasa a **opcional**. Sin él (o en
  blanco) devuelve los huecos de **cualquier empleado activo** del
  tenant fusionados por `startUTC.getTime()` (gana el primer activo del
  orden de `findByTenantId`, `createdAt desc`) y añade `employeeId` a
  cada slot de la respuesta; con él se comporta como antes. Si no hay
  activos → `slots: []`. No-string → 400 `employeeId must be a string`.
- `POST /reservations`: `employeeId` opcional. Si falta o está en
  blanco, `assignEmployee()` consulta el propio `GetAvailabilityUseCase`
  con ventana exacta `[start, start + duration)` y `limit: 1` para ese
  slot; si nadie está libre → **409 `NO_EMPLOYEE_AVAILABLE`**
  (`mr-codes.ts`), sin reintentos. Orden de validaciones: service →
  duration → employee/asignación.
- **Un `employeeId` no-string NO cuenta como "sin preferencia"**: cae
  en el camino existente (test `500 forzado → INTERNAL_ERROR` con
  `employeeId: {x:1}` intacto).
- `UpdateTenantConfigUseCase.filterOwnerSettings` ahora **preserva**
  `allowCustomerAssignment` si el PUT no lo trae (mismo patrón que
  `availabilityBatchSize`). Sin esto, `PUT /admin/tenants/:id` (el
  panel admin no envía la clave) lo pondría a `false` y ocultaría el
  select al owner. Verificado con curl: PUT sin la clave mantiene el
  valor.
- `routes.ts`: `getAvailabilityUseCase` se construye antes que
  `createReservationUseCase` (nueva dependencia cruzada).
- La clave `allowCustomerAssignment` **ya existía** en
  `TenantSettings` (default `true`, comentario "F5") — F4.4c le da
  implementación y UI.

**Frontend:**

- `utils/booking.ts`: `showEmployeePicker(allowCustomerAssignment)` y
  `reservationEmployeeId(employeeId)` (`''` → `undefined`, así el POST
  siempre lleva la clave pero como `undefined` cuando es "sin
  preferencia").
- `CreateReservation`: lee `settings.allowCustomerAssignment` de
  `GET /tenants/me` (si es `false` oculta el select y fuerza
  `employeeId=''`); `availabilityReady` arma los params **sin**
  `employeeId`; fecha concreta → `from` **sin** `to`; el `<option>`
  "Sin preferencia" es el default (`value=""`).
- Aviso de día sin huecos: si `requestedDay` no tiene slots pero sí
  los hay a partir de `firstSlotDay` →
  `data-testid="slot-day-gap-notice"`: *"No hay huecos el X. Mostrando
  huecos a partir del Y."* (desaparece al volver a "Lo antes posible").
- `SlotPicker`: `SlotOption.employeeId` + prop `employeeNameOf`; el
  nombre del empleado va bajo el horario (solo en modo sin preferencia
  y si el backend lo devuelve).
- `TenantConfig`: checkbox "Let customers choose the employee" →
  `settings.allowCustomerAssignment` en el PUT (viene precargado del
  GET).

### Tests (+24 backend → 752; +9 frontend → 167)

- Unit `GetAvailabilityUseCase`: fusión de huecos de varios empleados
  por `startUTC`, gana el primero activo del orden, sin activos →
  `[]`, `employeeId` por slot, no-string → 400.
- Unit `CreateReservationUseCase`: asigna al libre del slot (sin
  reintentar), 409 `NO_EMPLOYEE_AVAILABLE` (sin guardar) cuando no hay
  nadie libre / fuera de horario, employeeId concreto sigue validando
  solapes.
- Integración `availability.test.ts`: sin `employeeId` (union +
  `employeeId` por slot) y con `employeeId` (comportamiento previo).
- Integración `reservations.test.ts`: 201 con `employeeId` omitido →
  empleado asignado; 409 `NO_EMPLOYEE_AVAILABLE` (fuera de horario y
  sin activos); body `employeeId: {x:1}` → 500 intacto.
- Frontend `CreateReservation.test.tsx`: select en "Sin preferencia" y
  `/availability` sin `employeeId`, POST con `employeeId: undefined`,
  nombre por slot, `allowCustomerAssignment=false` → sin select, aviso
  de día sin huecos (y sin aviso en "Lo antes posible").
- Frontend `SlotPicker.test.tsx`: nombre con `employeeNameOf`, sin la
  prop → solo el horario, nombre `undefined` no rompe el clic.
- Frontend `TenantConfig.test.tsx`: checkbox carga desde el tenant y
  se envía en el PUT. El test existente "Elegir fecha" pasa a esperar
  `from` **sin** `to`.

### Deuda / decisiones aplazadas

- El aviso de día sin huecos no sugiere ni re-intenta con otro
  servicio ni con otro empleado concreto.
- "Sin preferencia" no explica al usuario que el empleado concreto lo
  elige el sistema (el nombre aparece en el slot, pero no hay texto
  explicativo).
- `allowCustomerAssignment` afecta solo a la reserva del cliente; la
  agenda de owner/employee (F5) mantendrá su propio picker.



## F4 / F4.5b — Creación y cancelación de grupos de reserva (2026-10-02)

**Estado:** implementada (solo backend — la UI queda en **F4.5d**).
Backend 817/817 (`tsc --noEmit` 0), frontend 167/167 (`tsc -b` 0, sin
regresión). Cubre también lo previo de **F4.5a** (que no dejó sección
propia): `GET /availability` acepta `serviceIds` + `duration`, calcula
la suma de duraciones como ancho de bloque y filtra empleados que no
ofrecen todos los servicios (`canOfferAll`).

**Backend — creación (`POST /reservations`):**

- **Entrada**: `serviceIds: string[]` nuevo, `serviceId` clásico
  intacto. Orden = orden del request; repeticiones permitidas (solo
  son tramos). No-array o elemento no-string → 400
  `serviceIds must be an array of strings`; tras sanear, vacío → 400
  `serviceIds is required`.
- **Longitud 1 → reserva simple SIN grupo** (mismo camino que
  `serviceId`), que sigue funcionando igual (retro-compat).
- **N filas encadenadas**: `groupBookingId = genUUID('grp')` en
  todas, `start_i = start + Σ durations[0..i-1]`, `date`
  recalculado por fila con la zona del tenant (el bloque puede cruzar
  medianoche) y `activeKey` propio por fila.
- **Duración**: en modo grupo, `duration` (si viene) debe ser la suma
  exacta → 400 `duration must match the total service duration`; la
  suma se limita a `settings.maxServiceDuration` → 400
  `serviceIds total duration must be at most N minutes` (solo si el
  tenant define el techo).
- **Capacidad**: con `employeeId` explícito el empleado debe ofrecer
  TODOS los servicios (`offersAllServices` o M2M) → 400
  `employee does not offer all the requested services`; sin
  preferencia se pide disponibilidad en modo `serviceIds` (motor
  F4.5a) → 409 `NO_EMPLOYEE_AVAILABLE` si nadie cubre el bloque.
- **Solape por ventana total** `[start, start + total)` (así el bloque
  que cruza medianoche no mira otro día) + chequeo del `activeKey`
  exacto de cada fila; la carrera final la resuelve P2002 → 409
  `RESERVATION_OVERLAP` (sin reintentos: otra hora).
- **Persistencia atómica**: `saveMany()` = `prisma.$transaction` de
  upserts — o las N filas o ninguna.
- **Respuesta**: la primera fila + `groupBookingId` (siempre presente,
  `null` sin grupo) + `groupTotalPrice` (suma de precios, solo en
  grupo). `GET /reservations/:id` y el listado adjuntan ambos con
  `findGroupTotals` (1 query por página, sin N+1).
- **Bitácora**: UNA entrada por grupo (`entityId = groupBookingId`)
  con metadata `serviceIds`, `groupRows`, `totalDuration`.
- **Email**: UNO por grupo, con el listado de servicios y `Total: …`,
  `cancelUrl` = token de la primera fila y asunto `A + B`. Sin email
  en el cliente no se envía (como antes).

**Backend — cancelación de grupo:**

- Helper nuevo `cancelReservationGroup.ts`: cancela en una sola
  `saveMany` todas las filas **activas** del grupo (indivisible: o el
  bloque entero sigue vivo o se cancela entero). Compartido por
  `CancelReservationUseCase.execute` (id + tenant),
  `executeByToken` (público) y `UpdateReservationUseCase` con
  `status: 'cancelled'`.
- Si NINGUNA fila está activa → 409 `RESERVATION_INVALID_STATE`;
  fila objetivo inexistente → 404.
- Bitácora: UNA entrada por grupo (`entityId = groupBookingId`), nunca
  por fila; la vía pública por token no escribe bitácora (no hay
  actor).
- Las filas sin grupo se comportan exactamente que antes.

**Verificación manual (DoD curl, backend en `:3100`, BD dev):**

- `POST` con `serviceIds: [svc-demo-1, svc-demo-3]` → 201,
  `groupBookingId` idéntico en las 2 filas, `groupTotalPrice: 43`,
  10:00→10:30 y 10:30→11:15, `activeKey` distintos ✓.
- Solape en mitad del bloque (11:00) → 409 `RESERVATION_OVERLAP` y
  **0 filas nuevas** ✓.
- `PUT /reservations/:id` con `status: cancelled` → ambas filas
  `cancelled` + `activeKey` vacío + **1** sola bitácora
  `cancel_reservation` con `entityId = grp-…` ✓; re-reservar el hueco
  → 201 ✓.
- Cancelación pública `POST /reservations/cancel/:token` → grupo
  entero cancelado y **sin** bitácora ✓.
- `serviceIds: ['svc-demo-1']` → 201 con 1 fila sin grupo;
  `serviceId: 'svc-demo-1'` → 201 con 1 fila sin grupo ✓.
- Limpieza: 6 reservas + 4 clientes + 5 entradas de bitácora de prueba
  borrados (BD dev intacta), backend detenido por PID (el de `:3000` y
  el resto del entorno ajenos sin tocar), worktree limpio.

### Tests (+40 → 817; `tsc --noEmit` 0)

- Unit `CreateReservationUseCase` (+18 → 48): 2 filas encadenadas,
  `groupBookingId`/`activeKey`/`groupTotalPrice`, 1 email, cruce de
  medianoche, len 1 y `serviceId` sin grupo, shapes de `serviceIds`
  (ajeno/inactivo → 400), techo de duración, capacidad con/sin
  preferencia, solape por ventana y por `activeKey`, P2002 → 409 sin
  bitácora ni email, duplicados permitidos.
- Unit `CancelReservationUseCase` (+7 → 19) y
  `UpdateReservationUseCase` (+4 → 17): grupo completo cancelado en
  una transacción, solo filas activas, 0 activas → 409, token sin
  bitácora, `notes`/`status` solo en la fila pedida.
- Unit `Reservation` (+2 → 25): construcción de grupo encadenado y
  cruce de medianoche.
- Integración `reservations.test.ts` (+9 → 56): 201 + 2 filas,
  detalle/listado con grupo y total, solape → 409 + 0 filas, PUT
  cancel → grupo cancelado + 1 bitácora, re-reservar → 201, token
  cancela el grupo, `serviceIds` de 1 y `serviceId` sin grupo.

### Deuda / decisiones aplazadas

- **Caso B (F4.5c)**: tramos NO contiguos (p. ej. reservar 10:00 y
  15:00 en el mismo grupo). El encadenado actual solo admite bloques
  seguidos.
- **Frontend (F4.5d)**: ~~picker multi-servicio en `CreateReservation`
  y lectura de grupos en agenda/detalle~~ → cerrado en F4.5d (sigue
  abajo el resto de deuda).
- El filtro de capacidad se aplica **solo** en modo `serviceIds`
  (decisión F0): el camino `serviceId` no cambia.
- `GET /reservations` no tiene filtro `?groupBookingId` en v1 (el
  total del grupo se calcula por página); añadirlo si la UI lo pide.
- Un grupo con servicios repetidos (`[a, a]`) es válido: 2 filas del
  mismo servicio encadenadas.
- Solo la primera fila tiene enlace de cancelación; las filas 2..N se
  cancelan siempre con el grupo.
- Numeración corregida: el "multi-servicio (F4.2)" previsto en
  F4.1a/F4.1b es ahora F4.5a/F4.5b (`F4.2` acabó siendo el error
  handling global) y la agenda de owner/employee citada como F4.5 en
  F4.4c pasa a F5.



## F4 / F4.5d — Multi-servicio en el frontend (2026-10-02)

**Estado:** implementada. Solo frontend: el backend de F4.5a/F4.5b no
se toca. `npm run test:front` 181/181 (+14, `tsc -b` 0), backend
`npm test` 817/817 sin regresión. Prueba manual en navegador 15/15.

**`CreateReservation.tsx` (alta multi-servicio):**

- El select de un servicio pasa a **checkbox-list** (patrón de
  `CreateEmployee.tsx`): `serviceIds: string[]` + `toggleService`,
  ningún servicio marcado por defecto.
- `selectedServices`, `duration = Σ durations` y `totalPrice =
  Σ prices` se derivan del estado (sin estado duplicado).
- Resumen `data-testid="reservation-summary"`: `N servicios · X min ·
  Y €` con `formatPrice`.
- `availabilityReady = serviceIds.length>0 && (asap || date)`; los
  params de `GET /availability` llevan **siempre** `serviceIds` (CSV en
  orden de selección, aunque sea 1) y **nunca** `duration` — el backend
  los trata como excluyentes. `handleLoadMore` igual.
- `POST /reservations` con `serviceIds: [...]` y **sin** `serviceId`.
  Validación local: "Selecciona al menos un servicio."
- `SlotPicker` y `api/client.ts` **sin cambios** (decisión F0).

**Lectura de grupos (3 pantallas):**

- `Reservations.tsx`: `ReservationView` expone `groupBookingId` y
  `groupTotalPrice`; `groupStats` agrupa por `groupBookingId`
  **ignorando la posición** de las filas (filas intercaladas válidas).
  Badge `group-badge-{resId}` ("N servicios") + `group-total-{resId}`
  ("Total Y €") calculado sumando `service.price` de las filas visibles
  de ese grupo (respeta filtros/paginación).
- `ReservationDetail.tsx`: fila "Group total" (`group-total`) con
  `groupTotalPrice` del backend. El **tamaño** del grupo no lo trae el
  detalle → effect que cuenta filas del grupo vía `GET /reservations
  {limit:200}` (con cleanup); nota `group-cancel-note` + `confirm`
  con `groupCancelText(N)` ("all N reservations in the group"; si la
  cuenta falla, texto genérico "every reservation").
- `CancelReservation.tsx` (página pública por token): si la preview
  trae `groupBookingId` → aviso `group-cancel-notice` (`role="status"`).
  Sin N (el listado exige auth): "cancelling it cancels the whole
  group". El botón sigue cancelando el grupo entero vía backend.

**`utils/booking.ts`:** nuevos `sumServiceDurations`, `sumServicePrices`,
`serviceIdsParam`, `reservationSummary` y `groupCancelText`; `formatPrice`
sigue emitiendo NBSP antes de `€` (en tests se normaliza).

**Verificación manual (navegador, backend `:3100` + Vite `:5174`,
ambos míos y ya detenidos; Chromium del sistema vía `channel: 'chrome'`
porque el build Playwright 1243 no está instalado):**

- Login owner (demo) → alta: checkbox "Classic Haircut" +
  "Manicure" → resumen `2 servicios · 75 min · 43,00 €` ✓.
- `GET /availability?serviceIds=svc-demo-1,svc-demo-3` sin `duration` ✓;
  slot del bloque `10:00 - 11:15` con empleado asignado ✓.
- `POST` body `serviceIds: ["svc-demo-1","svc-demo-3"]`, sin
  `serviceId` ✓.
- Listado: badge `2 servicios` + `Total 43,00 €` ✓; detalle: `43,00 €`
  + aviso "all 2 reservations in the group" ✓.
- Cancel pública por token: aviso de grupo visible ✓ (sin cancelar);
  cancelación desde el detalle: confirm con el texto del grupo →
  ambas filas `cancelled` en BD, 1 bitácora por grupo ✓.
- Limpieza: 2 reservas + 1 cliente + 2 bitácoras de prueba borrados,
  procesos míos (`:3100`, `:5174`) detenidos por PID, script temporal
  `f45d-dod.cjs` borrado.

### Tests (+14 → 181; `tsc -b` 0)

- `CreateReservation.test.tsx` (+5 → 21): resumen con 2 servicios, 1
  servicio → igual que antes, body con `serviceIds` en orden de
  selección, params sin preferencia + multi, day-gap con multi. Los
  16 tests previos migrados de `duration`/`serviceId` a `serviceIds`.
- `Reservations.test.tsx` (+3 → 11): badge y total en las 2 filas,
  agrupación con fila intercalada (posición irrelevante), sin grupo →
  sin badge/total.
- `ReservationDetail.test.tsx` (**nuevo**, 4): total + aviso con N,
  confirm del grupo, sin grupo → sin nada, lista inaccesible → texto
  genérico.
- `CancelReservation.test.tsx` (+2 → 6): aviso de grupo con/sin
  `groupBookingId`.
- `SlotPicker.test.tsx` sin tocar (regresión: sigue en verde).

### Deuda / decisiones aplazadas

- **Caso B (F4.5c)** sigue abierto: tramos no contiguos.
- `GET /reservations/:id` no devuelve el tamaño del grupo → el
  detalle refetchea el listado (`limit=200`); añadirlo al backend si
  la UI lo necesita (evita el N+1 de páginas > 200).
- Cambiar un checkbox re-pide disponibilidad y repinta los slots
  (petición en cadena sin debounce); optimizable en F5+.
- i18n: cadenas nuevas en inglés como el resto (SF8 pendiente).
- `groupTotalPrice` del backend se muestra tal cual; si un grupo
  mezclara filas de distintos tenants (hoy imposible) el total sería
  inconsistente.

## F4.6 / F4.6a — Infraestructura i18n (2026-10-02)

**Estado:** implementada. Solo frontend (el backend no cambia), rama
`feature/f4.6-i18n` desde `main` (tras el squash de F4).
`npm run test:front` **223/223** (+42, `tsc -b` 0), `npm test`
**817/817** sin regresión. Prueba manual en navegador **16/16**.

**Infraestructura (artesanal, sin librerías — F0 #1):**

```
frontend/src/i18n/
├── index.tsx        # I18nProvider + useI18n() + re-exports
├── types.ts         # Locale, I18nDictionary, constantes (LOCALE_STORAGE_KEY…)
├── detection.ts     # normalizeLocale + detectLocale + lectura/escritura storage
├── format.ts        # formatPrice/formatNumber/formatDate por locale
├── errorMessages.ts # ERROR_CODE_TO_KEY + extractBackendError + translateError
└── locales/
    ├── index.ts     # import de los JSON + deep-merge → `dictionaries[locale]`
    └── {en,es}/*.json   # common, auth, errors, tenant, services, employees,
                         # reservations, agenda, admin, bitacora, config
```

- `index.tsx` (no `.ts`): el provider usa JSX. Cada JSON aporta su
  espacio de nombres (`auth.json` → `auth.*`) y `locales/index.ts` los
  fusiona (deep-merge) en dos diccionarios completos.
- **Decisión F0 #9:** se importan los DOS idiomas completos de una
  (~10 KB por idioma) — sin lazy-loading ni `import()`.
- `t(key, params)`: busca en el idioma activo → si falta, en `en` →
  si tampoco, devuelve **la propia clave**. Interpola `{param}`.
- `useI18n()` lanza fuera del provider (patrón de contexts del repo).
  Envuelve TODO en `App.tsx`.

**Detección y persistencia (F0 #3 y #4):**

- Orden: `localStorage('mr.locale')` (**usuario**) >
  `tenant.settings.defaultLanguage` > `navigator.language` > `en`.
- Cada origen se normaliza (`es-AR` → `es`, `fr-FR` → null).
- El provider lee `/tenants/me` **best-effort** solo con sesión
  (token en localStorage): 401/403 o error de red → se ignora y gana
  el navegador. Si se inyecta la prop `tenantLanguage`, no hay fetch
  (tests / caller que ya conoce el tenant).
- `setLocale()` persiste en `localStorage` → la preferencia del
  usuario gana al tenant (F0 #4), verificado en navegador.
- `document.documentElement.lang` se actualiza en cada cambio (F0 #5).

**Mapa de errores (F0 #7):**

- `errorMessages.ts` centraliza `ERROR_CODE_TO_KEY`: 16 códigos de
  dominio (`mr-codes`) + 6 genéricos (`codes`) → `errors.<CODE>`.
- `extractBackendError(err)` entiende las 3 formas que llegan al
  frontend: envelope `{ error: { code, message } }`, el error ya
  normalizado por el interceptor de `api/client.ts` (`error.code` +
  `data.error` string) y `Error`/string planos.
- `translateError(err, t)`: clave traducida → mensaje i18n; sin clave
  (o `t` devuelve la clave) → `message` del backend (inglés); sin
  nada → `''` y el caller aplica su fallback.
- Cadenas en `locales/{en,es}/errors.json` (ver desviación abajo).

**Formateo por locale (F0 #6):**

- `formatPrice` / `formatNumber` / `formatDate` salen de
  `utils/booking.ts` (fijo a `es-ES`) a `i18n/format.ts` y aceptan
  cualquier tag BCP-47 (`en-US`, `es-AR`, …).
- `utils/booking.ts` **re-exporta** `formatPrice` → las 7 páginas que
  lo importan de ahí no cambian. Sin argumento, usa el locale activo
  que fija `I18nProvider` (`setCurrentLocale`), así que los precios de
  la UI cambian con el idioma sin tocar esas páginas.
- Moneda sigue hardcodeada a EUR (el tenant define `currency`: deuda).

**PoC (F0 #12): solo `LoginForm`.** `Layout`, el resto de páginas y
el contenido (nombres de servicios, notas) **NO** se traducen todavía.

**Verificación manual (navegador, backend `:3100` + Vite `:5174`,
ambos míos y ya detenidos; Chromium del sistema vía `channel: 'chrome'`):**

- Locale por defecto = navegador (`es-ES` en este equipo) → `Entrar`,
  `Contraseña`, `Regístrate`, `<html lang="es">` ✓.
- Contraseña errónea → `401 UNAUTHORIZED` → **«Fallo de autenticación.»**
  (traducción del code) ✓; con `mr.locale=en` → «Authentication failed.» ✓.
- `localStorage.mr.locale=en` → `Sign in`, `Password`, `Sign up`,
  `<html lang="en">` ✓.
- `/services` con `en` → `€25.00`; con `es` → `25,00 €` ✓ (mismo
  `formatPrice`, sin tocar `Services.tsx`).
- Tenant demo tiene `settings.defaultLanguage: "en"`: tras login, el
  idioma del usuario (`es`) **sigue ganando** → `<html lang="es">` ✓.

### Tests (+42 → 223; `tsc -b` 0)

- `i18n/detection.test.ts` (10): normalización de etiquetas, orden
  usuario > tenant > navegador > en, ignorar no soportados, storage.
- `i18n/index.test.tsx` (12): `t()`, fallback a `en` (diccionario `es`
  con `auth` borrado vía `vi.mock`), clave inexistente → clave,
  interpolación, `formatPrice` del contexto, `setLocale` + persistencia
  + `<html lang>`, precedencias, `useI18n` fuera del provider → throw.
- `i18n/errorMessages.test.ts` (10): mapa de códigos, extracción de
  las 3 formas de error, `i18nKeyForError`, `translateError` con sus
  4 caminos.
- `i18n/format.test.ts` (7): `en-US` vs `es-ES` en precio/número/fecha,
  `null` → `—`, locale activo, fecha inválida.
- `LoginForm.test.tsx` (5 → 10): envuelto en `I18nProvider`, textos en
  `en` (default) y `es` (localStorage), traducción de code, fallback al
  `message`, clave de fallback.
- `App.test.tsx` / `Reservations.test.tsx`: ajustes por el cambio de
  default de `formatPrice` (`en`) y del Login traducido.
- `Layout.test.tsx`: envuelve los renders en `I18nProvider` (monta
  `LoginForm` → `useI18n`).

### Desviaciones de la estructura propuesta

- `i18n/index.ts` → **`index.tsx`** (el provider necesita JSX).
- **`errors.json` añadido** a `locales/{en,es}/` (la estructura F0 no
  lo listaba): respeta la regla de "common.json con solo 2-3 claves"
  y mantiene `errors.*` como dominio propio.
- `tsconfig.json`: `resolveJsonModule: true` (importar los JSON).

### Deuda / decisiones aplazadas

- **i18n del resto de la UI**: F4.6b (`Layout` + `common`/`tenant`),
  F4.6c (services/employees/reservations/agenda), F4.6d
  (admin/bitacora/config). Hoy la app queda mezclada: Login traducido,
  el resto en español/inglés hardcodeado.
- **Contenido NO traducido** (F0): nombres de servicios, notas,
  mensajes que escriben los usuarios.
- `reservationSummary` / `groupCancelText` (`utils/booking.ts`) siguen
  generando texto **en español** aunque la UI esté en `en` → moverlos
  a claves i18n en F4.6c.
- **Plurales**: `t()` no tiene pluralización («1 servicio / 2
  servicios» se resuelve a mano en `reservationSummary`). Si F4.6c/c
  necesita plurales/fechas complejas → migrar a librería (i18next o
  similar); mientras, artesanal.
- Moneda fija a EUR aunque `tenant.settings.currency` existe.
- Toggle de idioma en la UI: no hay (cambio vía `localStorage`);
  natural en `Layout` para F4.6b.
- `Layout.tsx` hace auto-login demo en el mount **sin comprobar
  `VITE_DEMO_MODE`** (solo el backend decide): con backend
  `DEMO_MODE=true` el LoginForm nunca queda visible en navegador —
  afecta a E2E y a pruebas manuales (para verlo, backend con
  `DEMO_MODE=false`).

## F4.6 / F4.6b — Layout + auth + zona tenant (2026-10-02)

**Rama:** `feature/f4.6-i18n` (sin squash hasta cerrar F4.6).

### Alcance

- **`Layout.tsx`**: nav completa (9 items + enlace Admin), `Admin Panel`,
  `Tema`, `Logout`, panel demo (`Demo Mode`, `Mode Demo Activated`,
  error de login demo) y el banner owner-mode (`Operating as owner of
  tenant …` + `Exit owner mode`) → claves `nav.*` en `common.json`.
  Los **roles del select demo (Owner/Employee/Admin) NO se traducen**
  (son etiquetas de dominio, decisión F0).
- **Auth**: `Register.tsx` (labels, validación local, 409 →
  `errors.USER_EMAIL_EXISTS`, fallback `translateError`) y
  `CheckEmail.tsx` (título, cuerpo con `{email}` interpolado, botones,
  aviso, toasts) → `auth.register.*` / `auth.checkEmail.*` /
  `auth.verify.*`.
- **`VerificationBanner.tsx`**: link por defecto (`auth.verify.confirm`),
  botón reenviar y los 3 toasts internos (el `message` lo pasa cada
  página — en F4.6c se traducirán las páginas c/d).
- **Zona tenant**: `Dashboard.tsx` (loading, error, `Welcome, {name}`,
  subtítulo, banner + `Set up now`, sin acceso, 3 secciones,
  `active/inactive`, `View Details`, vacíos, `{n} services`,
  `View all {n} reservations`) y `TenantConfig.tsx` (título, loading,
  owner-only, banner, 5 fieldsets, opciones de retención, días de la
  semana, guardado/toasts y **las 18 validaciones** con `{at}`/`{n}`
  interpolados) → `tenant.dashboard.*` / `tenant.config.*`.
- Diccionarios `common`/`auth`/`tenant` poblados en **en + es**;
  `tenant.dashboard` pasó de string (`"Dashboard"`) a objeto anidado
  (nadie usaba la clave vieja). `common.json` añade `buttons.delete` y
  `buttons.confirm` (semilla F0 #1, aún sin usar en esta fase).

### Fix del auto-login demo (F0 #5)

`Layout.tsx` hacía `handleDemoLogin('admin')` en el mount **sin mirar
`VITE_DEMO_MODE`** (hallazgo de F4.6a). Ahora:

```ts
if (token) refreshUser();
else if (isDemoMode) { ... handleDemoLogin('admin'); }
```

- `VITE_DEMO_MODE=true` → auto-login demo (igual que antes).
- `VITE_DEMO_MODE=false` → **no** auto-login; se ve el `LoginForm`.
- Tests: 2 nuevos en `Layout.test.tsx` (ambos caminos, con
  `vi.stubEnv`).

### Tests (+15 → 238; `tsc -b` 0; backend 817 sin cambios)

- `i18n/dictionaries.test.ts` (3, nuevo): paridad de claves `en`/`es`
  en `common`/`auth`/`tenant`, sin valores vacíos y presencia de las
  claves de uso frecuente.
- `Layout.test.tsx` (+3): nav en español (`Panel`, `Servicios`,
  `Crear servicio`, `Configuración del negocio`, `Cerrar sesión`,
  `Tema`) y los 2 tests del fix de auto-login.
- `Register.test.tsx` / `CheckEmail.test.tsx` / `Dashboard.test.tsx` /
  `TenantConfig.test.tsx`: envueltos en `I18nProvider`, aserciones
  pasadas a `en` (default jsdom) + 1 test `es` por fichero.
- `Services.test.tsx` / `Employees.test.tsx`: solo los 4 tests que
  montan `VerificationBanner` (componente ahora con `useI18n`) se
  envuelven en `I18nProvider`; sus páginas siguen en español (F4.6c).

### DoD navegador (Chromium del sistema, 38/38)

Backend propio `:3100` (`DEMO_MODE=true`) + Vite `:5174`
(`.env VITE_DEMO_MODE=true`) y `:5175` (override
`VITE_DEMO_MODE=false` por shell — **sí** supera `.env`, corrigiendo
el apunte de F4.6a). Temporales en `/tmp/opencode/f46b/`, todo
detenido por PID y BD restaurada al terminar.

- `VITE_DEMO_MODE=true` → auto-login (admin) sin LoginForm; cambio a
  `owner` por el select demo → nav completa.
- `es` (default del navegador): nav, banner Dashboard
  (`Confirma tu email para empezar a usar MultiReservas` +
  `Configurar ahora`), TenantConfig (`Configuración del negocio`,
  `Nombre`, `Zona horaria (IANA)`, banner + `Reenviar email`),
  Register y CheckEmail → `<html lang="es">`.
- `en` (localStorage): misma batería → `Dashboard`, `Services`,
  `Create Service`, `Set up now`, `Tenant Config`, `Name`,
  `Password`, `Sign in`, `<html lang="en">`.
- `VITE_DEMO_MODE=false` (`:5175`) → **LoginForm visible**, sin
  navegación a `/dashboard` (fix verificado).
- Para ver el banner en navegador se marcó el tenant como no verificado
  con `settings.email_verification` (**el flag real**: presencia =
  no verificado; `emailVerified` es derivado en el serializer) y se
  restauró la BD al final.

### Deuda / decisiones aplazadas

- **F4.6c**: páginas c/d (services/employees/reservations/agenda) —
  incluye los `message=`/`linkLabel=` en español que hoy pasan a
  `VerificationBanner` y `reservationSummary`/`groupCancelText`.
- **F4.6d**: admin/bitacora/config.
- **Toggle de idioma en la UI**: sigue sin haber (cambio vía
  `localStorage`); candidato natural en el menú de `Layout`.
- `aria-label` de los inputs de break en `TenantConfig`
  (`Break 1 start of …`) quedaron en inglés.
- Plurales: `servicesCount`/`viewAll` resuelven a mano el conteo; ver
  deuda F4.6a (librería si crece).

## F4.6 / F4.6c-d — CRUDs y zona admin (2026-10-03)

**Rama:** `feature/f4.6-i18n` (sin squash hasta cerrar F4.6).
Ejecutado en paralelo (F4.6c = CRUDs; F4.6d = admin), decisiones F0
respetadas: diccionarios por dominio sin solapamiento, contenido de
usuario (nombres/notas) no traducido, `errors.<CODE>` vía
`translateError`.

### Alcance F4.6c — CRUDs

- Páginas: `Services`, `CreateService`, `ServiceDetail`, `Employees`,
  `CreateEmployee`, `EmployeeDetail`, `Reservations`,
  `CreateReservation`, `ReservationDetail`, `CancelReservation`,
  `Agenda` + componentes `SlotPicker` y `ConfirmDialog`.
- `utils/booking.ts`: `reservationSummary(count, duration, price, t)` y
  `groupCancelText(count, t)` reciben `t` como último argumento (antes
  hardcodeaban español/inglés); exportan el tipo `TranslateFn`.
  Llamantes actualizados en `CreateReservation.tsx` y
  `ReservationDetail.tsx` → `reservations.summary.one|many` y
  `reservations.groupCancel.every|all`.
- `ConfirmDialog`: `Cancel` y el default de confirm salen de
  `common.buttons.*`; el caller pasa `title`/`message` ya traducidos.
- Diccionarios nuevos poblados en **en + es** con paridad total:
  `services` (36), `employees` (52), `reservations` (80), `agenda` (9)
  → **177 claves**.

### Alcance F4.6d — zona admin

- Páginas: `admin/AdminTenants`, `admin/AdminTenantDetail`,
  `admin/BitacoraPage`, `admin/ConfigPage` + `AdminSubNav` (labels del
  sub-menú `Tenants|Bitacora|Config`).
- No existe componente `AdminGuard` (el guard de rol vive en
  `App.tsx`); `App.tsx` no requirió cambios (un diff de indentación
  incidental se revirtió antes de commitear).
- Diccionarios nuevos poblados en **en + es** con paridad total:
  `admin` (51), `bitacora` (37), `config` (11) → **99 claves**.
  Reutiliza `common.nav.dashboard` y `common.error`.
- `BitacoraPage.test.tsx` y `ConfigPage.test.tsx` **no existen** (no se
  crean, fuera de alcance).

### Tests (238 → 268; `tsc -b` 0; backend 817 sin cambios)

- +2 ficheros nuevos de paridad: `i18n/dictionaries-c.test.ts` (2 tests)
  e `i18n/dictionaries-d.test.ts` (3 tests) — claves `en`/`es` idénticas
  y sin valores vacíos en los 7 diccionarios nuevos.
- Actualizados a `I18nProvider` con aserciones en `en` (default jsdom) +
  caso `es`: `Services`, `Employees`, `Reservations`,
  `CreateReservation`, `ReservationDetail`, `CancelReservation`,
  `Agenda`, `SlotPicker` (c) y `AdminTenants`, `AdminTenantDetail` (d).

### DoD navegador (36/37 en la primera pasada limpia)

Backend propio `:3100` (`DEMO_MODE=true`) + Vite `:5174`
(`VITE_API_URL` apuntando a `:3100`); Chromium del sistema
(`channel: 'chrome'`); idioma cambiado por `localStorage` `mr.locale`
con `reload` (la clave `mr.locale` debe escribirse **después** de cargar
la página — un `addInitScript` la pisaba en cada navegación y forzaba
falsos fallos en `en`).

- **c/es** (owner): títulos y formularios de Services/Employees/
  Reservations/Agenda, filtros (`Estado`), `SlotPicker`
  (`Horarios disponibles` + `1 servicio · 30 min · €25,00` tras elegir
  servicio), detalle de reserva (`Guardar notas`), 404 real
  `SERVICE_NOT_FOUND` → `Servicio no encontrado`.
- **c/en**: misma batería → `Services`, `Name`, `Employee`, footer de
  Agenda, `Service not found`.
- **d/en** (admin): sub-nav (`Tenants`), lista de tenants, detalle
  (`Configuration`, `Operate as owner`), bitácora (`Activity log`,
  columna `Action`), config (`Settings`).
- **d/es**: `Negocios`, `Resumen de la plataforma`, `Operar como
  propietario`, `Registro de actividad`, columna `Acción`,
  `Configuración`.
- El único fallo (37) fue una aserción prematura: la sección de slots
  solo se renderiza **tras** seleccionar un servicio; tras el click
  (`slotpicker slots` + `reservationSummary`) pasa ✓.

### Deuda / decisiones aplazadas

- **Toggle de idioma en la UI**: sigue sin haber (cambio vía
  `localStorage`); candidato natural en el menú de `Layout`.
- Plurales: `summary.one/many` y `groupCancel.every/all` resueltos a
  mano con claves separadas; ver deuda F4.6a (librería si crece).
- `aria-label`s pendientes (inputs de break en `TenantConfig` desde
  F4.6b; revisar los de SlotPicker/Agenda al pasar deuda).
- `BitacoraPage`/`ConfigPage` sin tests unitarios propios (ya lo
  estaban; no se crean en esta fase).

## F4.7 / F4.7a — Reprogramación de reservas (backend) (2026-10-03)

**Rama:** `feature/f4.7-reprog` (sin squash hasta cerrar F4.7).
Frontend → F4.7b. Decisiones F0 aplicadas tal cual (ver brief).

### Endpoint ampliado (F0 #2)

`PUT /api/v1/reservations/:id` acepta además de `notes`/`status`:
`date`, `startTimeUTC` y `employeeId?`.

- **Cualquiera de los tres campos** activa el camino de
  reprogramación; `date` y `startTimeUTC` van juntos (solo uno → 400).
  `employeeId` opcional: ausente o en blanco → conserva el actual
  (interpretación del "y/o" del scope #1: también admite cambiar solo
  el empleado, manteniendo fecha/hora).
- `notes` puede acompañar (se aplica a la fila objetivo);
  **`status` + reprogramación → 400** (`status cannot be combined
  with a reschedule`) — mezclarlos es contradictorio.
- Sin reprogramación → comportamiento anterior intacto (notes/status/
  cancelación de grupo/reactivación).

### Reprogramación de grupo (F0 #3-#5)

- Si la fila tiene `groupBookingId` se reprograman **todas las filas
  activas** (las inactivas no se tocan; ninguna activa → 409
  `RESERVATION_INVALID_STATE`; la fila objetivo cancelada → 409).
- **La hora pedida marca la fila objetivo**; el resto se reencadenan
  por duración conservando el orden (offsets: `start_i = requested +
  (offset_i − offset_target)`), con `date` local recalculado por fila
  (puede cruzar medianoche). Así un PUT sobre la fila 2 pone la fila
  2 exactamente en la hora pedida y la fila 1 se recorre 30 min
  hacia atrás (o lo que dure).
- Solapamiento por **ventana total** (como F4.5b) vía
  `findActiveRanges`, que ahora acepta `excludeReservationIds` para
  **excluir las filas propias** — sin esto, la ocupación vieja del
  grupo se detectaría a sí misma como solape. Persistencia con
  `saveMany` (una transacción) en grupo / `save` en simple; P2002 →
  409.
- `activeKey` viejo queda libre y el nuevo asignado por fila al
  sobrescribir la fila en la transacción.

### Validaciones (F0 #6-#10)

- Fecha futura (`Reservation cannot be in the past` → 400).
- Solape con otras activas del empleado → 409
  `RESERVATION_OVERLAP`.
- Empleado del tenant + activo + **capaz**
  (`offersAllServices` o M2M `serviceIds`, todos los servicios del
  bloque). *Nota:* en la creación simple explícita no se valida
  capacidad; aquí sí (decisión F0 #8) — más estricto a propósito.
- Servicio de cada fila sigue activo → 400.
- `date`/`startTimeUTC` coherentes con la zona del tenant → 400
  `DATE_START_TIME_MISMATCH` (mismo código que F3.3).
- Sin límite de tiempo para reprogramar (F0 #16) — como cancelar.

### `cancelToken` regenerado (F0 #11)

Nuevo método de entity `Reservation.withSchedule({ date,
startTimeUTC, employeeId? })`: recalcula `endTimeUTC`/`activeKey` y
**regenera `cancelToken` con `nanoid(21)`**. Motivo: el email viejo
debe dejar de cancelar — solo el email más reciente vale. En grupo se
regenera el token de **cada fila**. Tests: el token viejo → 404 y el
nuevo → 200 (unit + integración + curl).

### Email de reprogramación (F0 #12-#14)

Reenvío (nunca bloquea) con asunto
`Reservation rescheduled - <servicios>`, contenido con empleado,
fecha/hora nueva del inicio del bloque, duración total y
`cancelUrl` con el **token nuevo de la primera fila** (en grupo, la
fila 1 del bloque). Solo si el cliente tiene email.

### Bitácora (F0 #15)

Acción `reschedule_reservation`, **1 entrada por reserva o por
grupo** (`entityId = groupBookingId ?? id`) con metadata exacta
`{ oldStart, newStart, oldEmployeeId, newEmployeeId, groupId? }`
(`newStart` = hora pedida = inicio de la fila objetivo).

### Verificación (DoD)

- `npm test` → **842/842** (817 + 25: 15 unit `UpdateReservationUseCase`
  + 8 integración + 2 que ya existían en el fichero se mantienen
  verdes) — ficheros: unit `UpdateReservationUseCase.test.ts` (34) e
  integración `reservations.test.ts` (64).
- `npx tsc --noEmit` (backend) → **0**.
- `npm run test:front` → **268/268** (baseline real de la rama; el
  DoD decía 238 pero el squash de F4.6 trae 268 — sin regresión, cero
  cambios de frontend).
- **curl manual (24/24)** en backend propio `:3100`:
  reprogramación simple → 200 con activeKey nuevo (`-15:00`), token
  nuevo, activeKey viejo libre en BD, token viejo → 404 / nuevo →
  200; hora ocupada → 409 `RESERVATION_OVERLAP`; fecha pasada → 400;
  grupo → 2 filas a 19:00/19:30 encadenadas, todos los tokens
  distintos y regenerados, viejos → 404, nuevo → 200; bitácora = 2
  entradas; emails con asunto `Reservation rescheduled` en el log.

### Deuda / aplazado

- Sin límite de tiempo para reprogramar (F0 #16, deliberado —
  revisar si el negocio pide ventana tipo "hasta 24h antes").
- Sin "sin preferencia" de empleado al reprogramar en el **endpoint**
  (conserva o exige employeeId explícito; auto-asignación como en
  F4.4c no se implementa). *F4.7b lo resuelve en frontend enviando el
  `employeeId` que trae el slot — ver sección F4.7b.*
- `service is not active` cubre también el caso "servicio
  eliminado" (mensaje único, sin código propio).
- `status` + reprogramación rechazado en bloque (400); si algún día
  hace falta "mover y cancelar", será otra decisión F0.

## F4.7 / F4.7b — Reprogramación de reservas (frontend) (2026-10-04)

**Rama:** `feature/f4.7-reprog` (sin squash hasta cerrar F4.7).
Backend F4.7a cerrado; esta sección es el frontend (brief F4.7b).

### Modal `RescheduleModal` (F0 #1-#2)

- Botón "Reprogramar" en `ReservationDetail` (junto a Cancelar, solo
  filas activas y `canEdit`) → **modal controlado** (`isOpen`,
  `role="dialog"`, Escape, foco al abrir), no página nueva: mantiene
  el contexto del detalle.
- Reutiliza **`SlotPicker` tal cual** con `GET /availability`:
  `serviceIds` CSV SIEMPRE (nunca `duration`), `from` sin `to` en
  modo fecha (aviso day-gap incluido), toggle ASAP/fecha igual que
  `CreateReservation`. En grupo los `serviceIds` son los de TODAS las
  filas activas (suma de duraciones = ancho del bloque, como F4.5d).

### Ancla de grupo: SIEMPRE la primera fila (decisión resolutiva)

Problema detectado al maquetar: el backend F4.7a toma **la fila :id
del PUT** como fila objetivo (`start_i = requested + (offset_i −
offset_target)`) y valida solape sobre `[blockStart, blockStart+total]`,
pero `GET /availability?serviceIds=…` solo garantiza la ventana **hacia
delante** desde el slot elegido. Coincidían solo si la fila objetivo
era la primera (`offset = 0`); abriendo el detalle de la 2ª fila,
elegir un hueco mostrado como libre podía devolver **409 espurio** por
la zona trasera (`[S−o, S)`).

**Solución (sin tocar backend):** el modal envía el PUT **siempre
sobre la primera fila activa del bloque** (`anchorId`, derivado del
mismo `GET /reservations?limit=200` que ya usa el detalle para
`groupSize`) con la hora del slot **tal cual** → `offset_target = 0` y
la ventana que garantiza availability es exactamente la que valida el
backend. Reserva simple → ancla = la propia fila.

- `serviceIds` del bloque y `groupCount` del aviso salen de ese mismo
  listado (filas activas ordenadas por `startTimeUTC`, mismo criterio
  que el backend para encadenar offsets).
- La respuesta del PUT es la fila ANCLA, que puede no ser la que se ve
  → `onRescheduled` cierra, muestra el aviso de éxito y **recarga el
  detalle** (trae además el `cancelToken` nuevo).

### Avisos del modal (F0 #3-#5)

- **Grupo:** "Esta reserva forma parte de un bloque de N servicios.
  Al reprogramar, se moverá el bloque entero." (fallback genérico si
  el listado no trajo las filas).
- **Token:** "Se enviará un nuevo email con el enlace de cancelación
  actualizado." El frontend no toca el token (lo regenera el backend
  F4.7a) ni el email (lo envía el backend).

### "Sin preferencia" de empleado (F0 #4)

- El selector arranca en "Sin preferencia"; oculto si
  `allowCustomerAssignment === false` (helper `showEmployeePicker`).
- Al confirmar se envía `employeeId = elegido || employeeId del slot ||
  nada`. **Interpretación:** como el endpoint F4.7a no auto-asigna
  (sin `employeeId` conserva el actual) y la disponibilidad se pidió
  sin filtro (cualquier empleado capaz), enviar el `employeeId` que
  trae el slot es lo que hace que "sin preferencia" signifique lo
  mismo que en F4.4c y evita 409 por una ventana que no es del
  empleado actual. Si el slot no trae empleado → se omite y el
  backend conserva el actual.

### i18n (F0 #7)

Claves nuevas `reservations.reschedule.*` (en + es, paridad
verificada por `dictionaries-c.test.ts`): `button`, `modalTitle`,
`groupWarning` (interpolación `{count}`), `groupWarningAny`,
`tokenWarning`, `submit`, `submitting`, `success`, `selectSlot`,
`loadError`, `submitError`. El resto reutiliza `form.*`, `picker.*`
y `buttons.cancel`.

### `api/client.ts` — sin cambios

El interceptor ya invalida `/reservations` (patrón + exacta) en todo
PUT/POST/PATCH/DELETE, y `/availability` ya tiene TTL 0.

### Verificación (DoD)

- `npx tsc -b` (frontend) → **0**.
- `npm run test:front` → **286/286** (268 + 18: 15 en
  `RescheduleModal.test.tsx`, 3 en `ReservationDetail.test.tsx`).
- `npm test` (backend) → **842/842** (sin regresión).
- **Navegador (24/24 aserciones)** — backend propio `:3100` y
  frontend `:5174` (los servicios ajenos `:3000`/`:5173`/`:8080`
  intactos), Playwright headless:
  - **simple:** detalle con token original → modal (aviso de token,
    sin aviso de grupo, empleado en "Sin preferencia", toggle
    ASAP/fecha, slots) → elegir slot → éxito → detalle recargado con
    la nueva hora, enlace con token **nuevo**, token viejo → 404 /
    nuevo → 200 en `GET /reservations/cancel/:token`.
  - **grupo (detalle de la 2ª fila):** aviso "block of 2 services",
    availability con `serviceIds` CSV completo, éxito → 1ª fila
    exactamente en el slot elegido, 2ª encadenada +45 min, tokens de
    ambas regenerados.
  - **email:** 2 × `Reservation rescheduled` en el log, con el token
    nuevo (en el grupo, el de la 1ª fila).
- Limpieza: filas y bitácora de prueba borradas de dev (12 reservas
  intactas), procesos `:3100`/`:5174` parados por PID, BD parada
  (estado inicial).

### Deuda / aplazado

- **Sin límite de tiempo** para reprogramar (F0 #16, deliberado).
- **Sin reenvío manual del email** (no hay botón "reenviar
  confirmación"; el email solo sale al reprogramar).
- Si el `GET /reservations` del grupo falla, el modal cae a la fila
  vista como ancla y con un solo `serviceId` (mismo techo de deuda
  que `groupSize`) → posible 409 al reprogramar filas no primeras.
- El backend sigue sin auto-asignar empleado (la "sin preferencia"
  se resuelve en frontend con el `employeeId` del slot).

## RRULE — propósito y uso
**Estado:** implementada en F3.4 (`dayMaster`, `ScheduleBlock.rrule`,
`Holiday.rrule`).

**Qué es:** la RRULE (RFC 5545) es el estándar para expresar
recurrencias en calendarios. En MR se **genera al guardar** un bloque
de horario o un festivo, y se **almacena como string derivado** en el
JSON de `schedules` y `holidays`.

**Fuente de verdad:** el **bloque estructurado**
(`{ label, days[], start, end, breaks[] }`). La RRULE es derivada y
**no se acepta desde fuera**: si el payload trae una RRULE, se ignora
y se regenera.

### Para qué se usa

- **Calendario visual (FullCalendar, F4.3):** pinta el horario del
  empleado y del tenant como "background events" recurrentes. Los
  festivos recurrentes, como eventos anuales.
- **Exportación iCal / sincronización externa (F5+):** el formato iCal
  usa RRULE para intercambiar recurrencias con Google Calendar,
  Outlook, etc.
- **Portabilidad / estándar:** cualquier sistema externo que hable
  iCal entiende la RRULE.

### Para qué NO se usa

- **Motor de disponibilidad:** el motor itera los **bloques
  estructurados**, no expande la RRULE. Motivo: la RRULE no modela
  breaks ni el rango `start`/`end` con precisión, y la fuente de
  verdad son los bloques.
- **Cálculo de slots:** se hace sobre bloques + reservas + festivos.
- **Validación de horarios:** se hace sobre los campos estructurados
  (`start`, `end`, `breaks`), no sobre la RRULE.

### Cómo se usa en el calendario visual (F4.3; festivos pendientes)

FullCalendar muestra tres capas:

| Capa | Tipo | ¿RRULE? |
|------|------|---------|
| **Horario del empleado / tenant** | Recurrente (background) | Sí — la generada en F3.4 |
| **Festivos recurrentes** | Anual (background/evento) | Sí — la generada en F3.4 |
| **Festivos puntuales** | Evento único | `DTSTART;VALUE=DATE` (no es RRULE) |
| **Reservas** | Evento único | **No** — son puntuales, se pintan tal cual |

**Importante:** las **reservas no tienen RRULE**. Son eventos
individuales. No hay que calcular ninguna RRULE "por reserva". El
fondo del calendario (horario) lo pinta FullCalendar expandiendo la
RRULE ya almacenada; las reservas van encima como eventos normales.

### Formatos generados

| Origen | RRULE |
|--------|-------|
| Bloque de horario | `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` (días en orden canónico mon→sun) |
| Festivo recurrente | `RRULE:FREQ=YEARLY;BYMONTH=MM;BYMONTHDAY=DD` |
| Festivo puntual | `DTSTART;VALUE=DATE:YYYYMMDD` (iCal DATE, no es RRULE) |

**Nota:** en los bloques de horario, la RRULE **no incluye horas ni
breaks** (viven en los campos estructurados). La RRULE solo expresa
los días de la semana.

### Eliminación futura

Si en algún momento se decide no usar calendario visual ni
exportación iCal, la RRULE se puede eliminar sin afectar al motor de
disponibilidad (es derivada y no es fuente de verdad). Sería un
cambio contenido: quitar `dayMaster`, la generación en
`ScheduleBlock.create`/`Holiday.create`, y sus tests.  