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