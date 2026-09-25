# Guía: cómo crear una Skill

## ¿Qué es una Skill?

Una Skill es un bloque de conocimiento reutilizable que el agente carga
en contexto cuando la necesita. Es un "manual de instrucciones" para
tareas concretas.

## ¿Dónde viven?

En `.agents/skills/<nombre>/SKILL.md`.

Este directorio lo leen OpenCode, Cursor y otros agentes de IA.
Si usas una herramienta que espera `.cursor/skills/` o `.claude/skills/`,
puedes crear un symlink.

## Estructura de una Skill

Cada skill es un directorio con al menos un `SKILL.md`:

    .agents/skills/<nombre>/
    ├── SKILL.md            (obligatorio)
    ├── templates/          (opcional, si la skill usa plantillas)
    └── examples/           (opcional, si la skill tiene ejemplos)

## Formato del SKILL.md

    ---
    name: nombre-de-la-skill
    description: Descripción corta de qué hace
    ---

    # Título

    ## Propósito
    ...

    ## Cómo usarla
    ...

    ## Output esperado (si aplica)
    ...

## Reglas

1. **Dentro de `skills/<name>/` solo va lo que forma parte de la skill:**
   `SKILL.md`, `templates/`, `examples/`. Nada más.

2. **Artefactos generados por la skill van fuera de `skills/`:**
   - `.agents/plans/` → planes de trabajo.
   - `.agents/reports/` → informes (auditorías, análisis).
   Estos directorios están en `.gitignore` y no se versionan.

3. **Naming:** `kebab-case`, corto y descriptivo.

4. **Frontmatter obligatorio:** `name` y `description`.

## Ejemplo mínimo

    ---
    name: my-skill
    description: Hace X cuando se le pide Y
    ---

    # My Skill

    ## Propósito
    ...

    ## Cómo usarla
    ...

## Ver también

- Skills existentes en `.agents/skills/` como referencia.
- `AGENTS.md` para el contexto general del proyecto.