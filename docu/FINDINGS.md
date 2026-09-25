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

## Decisiones arquitectónicas

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
