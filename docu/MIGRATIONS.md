# Migraciones — Prisma

## Flujo del starter: `db push`

Este starter usa **`prisma db push`**: el schema es la fuente de verdad
y se sincroniza contra la base de datos sin generar migraciones
versionadas.

**Ventajas:**
- Arranque rápido: `db push` + `db seed` y listo.
- Sin historial que mantener ni resets inesperados.
- Ideal para prototipar y para desarrollo local.

**Cuándo NO es suficiente:**
- Producción con múltiples entornos.
- Trabajo en equipo coordinando cambios de schema.
- Necesitas historial auditable de cambios.

## Cómo pasar de `db push` a migraciones (sin perder datos)

Este procedimiento se llama **baselining** y es la forma correcta de
adoptar migraciones cuando la BD ya tiene datos.

### Requisitos

- La BD debe estar **sincronizada con el schema actual**.
- `prisma` CLI disponible (ya está como devDependency).

### Paso 1 — Sincroniza la BD con el schema actual

    cd backend
    npm run db:push

No debe haber cambios pendientes.

### Paso 2 — Crea la migración inicial a partir del estado actual

    mkdir -p prisma/migrations/0_init
    npx prisma migrate diff \
      --from-empty \
      --to-schema-datamodel prisma/schema.prisma \
      --script > prisma/migrations/0_init/migration.sql

Esto genera un `migration.sql` con el `CREATE TABLE` de todo el schema.
**No se ejecuta todavía.**

### Paso 3 — Marca la migración como ya aplicada

    npx prisma migrate resolve --applied 0_init

Esto registra `0_init` en `_prisma_migrations` **sin ejecutar el SQL**
(las tablas ya existen por el `db push`). A partir de aquí, Prisma
sabe que la BD está gestionada por migraciones.

### Paso 4 — Verifica

    npx prisma migrate status

Debe decir "Database schema is up to date!" sin drift.

### Paso 5 — A partir de aquí, usa `migrate`

Para cambios en desarrollo:

    npx prisma migrate dev --name descripcion_del_cambio

Para producción:

    npx prisma migrate deploy

## Reglas de oro

1. **Nunca vuelvas a usar `db push`** en una BD gestionada por
   migraciones. Cada `db push` genera drift y el siguiente `migrate`
   pedirá un reset (que **borra la BD**).
2. **Haz backup antes de migrar en producción.** El starter incluye
   `npm run db:backup`.
3. **No borres `prisma/migrations/0_init/migration.sql`.** Es la base
   del historial.
4. **Versiona `prisma/migrations/` en git.** El `.gitignore` del
   backend ya está preparado con las negaciones necesarias
   (`!prisma/migrations/**/*.sql`); no tienes que tocar nada.

## Aclaración sobre rollback

Prisma **no tiene rollback automático** de migraciones. `prisma migrate
reset` **borra toda la BD** y reaplica las migraciones desde cero; no
es un rollback. Para deshacer una migración en producción:

- Restaura el backup previo, o
- Escribe manualmente el SQL inverso como una nueva migración.

## Sobre testing

`db push` es ideal para tests (rápido, sin archivos). Si el proyecto
derivado ya usa migraciones, los tests pueden seguir usando `db push`
contra una BD de test independiente.
