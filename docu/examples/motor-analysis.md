# Motor Analysis - AGENTS.md

> **Nota:** Este documento proviene de un proyecto real, editado para dejar solo las partes genéricas y reutilizables.

## 1. Contexto general

AGENTS.md funciona como el "contrato social" del proyecto, definiendo el stack tecnológico, convenciones de código, patrones arquitectónicos y reglas obligatorias para agentes autónomos. Su rol es crítico: sirve tanto como documentación para desarrolladores humanos como como instrucciones operativas para agentes de IA.

## 2. Análisis de cada regla

### 2.1 Regla 1: Never modify imports — no `.js` extensions on import paths

- **Propósito:** Mantener consistencia en el estilo de importación de módulos, evitando variaciones en la sintaxis de imports a través del codebase.
- **Problema que resuelve:** La inconsistencia en imports (algunos con `.js`, otros sin) genera ruido en diffs, complica revisiones de código y puede causar errores sutiles en resolución de módulos en proyectos ESM. Un agente podría "normalizar" automáticamente imports agregando extensiones, rompiendo el patrón establecido.
- **Implicaciones:** Los agentes deben reconocer y respetar el patrón existente. Esto limita la autocomodificación del código fuente y aumenta la dependencia del patrón original. Si el proyecto migrara a TypeScript puro con resolución de extensiones explícitas, esta regla se volvería obsoleta o contradictoria.
- **Relación con otras reglas:** Esta regla opera a nivel táctico (línea de código), mientras que la Regla 3 (IDs) opera a nivel estratégico (identidad de entidades). Ambas son invariantes de integridad: una afecta build-time, la otra runtime.

### 2.2 Regla 2: Backup AGENTS.md before editing → docu/saves-agents/

- **Propósito:** Garantizar trazabilidad y reversibilidad ante modificaciones al contrato fundamental del proyecto.
- **Problema que resuelve:** La pérdida de histórico de decisiones arquitectónicas. Sin backups, un cambio en AGENTS.md podría borrar contexto sobre por qué se adoptó cierta convención. Esto es especialmente crítico cuando un agente modifica las reglas que rigen su propio comportamiento — creando un posible "malestar epistemológico" donde las reglas cambian mientras se ejecutan.
- **Implicaciones:** Crea sobrecarga de proceso pero previene catástrofes de gobernanza. Los agentes deben implementar rutinas de backup antes de auto-modificarse.
- **Relación con otras reglas:** Es meta-regla — rige cómo se modifican las otras reglas. Las Reglas 1, 3 y 4 son contenido; esta es metacontenido.

### 2.3 Regla 3: IDs are flat strings with prefixes (e.g. `user-...`, `item-...`). No TypedId

- **Propósito:** Simplificar el modelo de identidad asegurando que todos los IDs sean strings planos con prefijos semánticos, evitando abstracciones como TypedId.
- **Problema que resuelve:** La complejidad innecesaria de sistemas de IDs tipados. TypedId añade capas de abstracción que, en un sistema con múltiples tipos de entidad, pueden complicar serialización, debugging y queries. Un string como `user-abc123` es inmediatamente comprensible en logs y base de datos.
- **Implicaciones:** Facilita debugging, logging y consultas SQL directas. Sin embargo, pierde type-safety en tiempo de compilación. Un agente podría pasar accidentalmente un `item-xyz` donde se espera un `user-xyz` y el error no se detectaría hasta runtime. La ausencia de TypedId requiere confiar más en la lógica de aplicación que en el type system.
- **Relación con otras reglas:** Esta regla y la Regla 4 (Member roles) juntas definen el modelo de datos. La Regla 3 dice "cómo identificamos entidades"; la Regla 4 dice "cómo relacionamos tipos de entidad".

### 2.4 Regla 4: Members have roles (`admin`, `user`, `guest`)

- **Propósito:** Unificar el concepto de "miembro" como entidad base, donde los roles definen permisos y relaciones, evitando duplicación de modelos.
- **Problema que resuelve:** La tentación de crear entidades separadas y paralelas para cada rol, lo que llevaría a código duplicado, queries más complejos y ambigüedad sobre cuál es la "verdad" del modelo. Al hacer de los roles propiedades de un miembro, se mantiene una única fuente de verdad para permisos y relaciones.
- **Implicaciones:** Simplifica el modelo relacional (menos tablas, menos joins) pero requiere que el sistema de roles sea lo suficientemente expresivo. Un agente debe entender que "promover" a un usuario significa cambiar su rol, no crear una nueva entidad.
- **Relación con otras reglas:** Esta regla da profundidad a la Regla 3. Mientras la Regla 3 define el formato de identidad (`user-abc123`), la Regla 4 define el semántica de relación (un miembro con role='admin' tiene permisos elevados). Juntas, forman el eje del modelo de dominio.

## 3. Relaciones entre reglas

Las 4 reglas forman un sistema cohesionado:

- **Regla 2 (Backup) → Regla 1, 3, 4:** La meta-regla permite evolucionar las otras 3. Si se decide que TypedId aporta más valor que costo, la Regla 2 garantiza que ese cambio sea reversible.
- **Regla 1 (Imports) ↔ Regla 3 (IDs):** Ambas a nivel táctico vs estratégico. La Regla 1 evita que un agente "rompa" builds por consistencia estilística; la Regla 3 evita que un agente "rompa" runtime por inconsistencia de datos.
- **Regla 3 (IDs) → Regla 4 (Member roles):** La Regla 3 establece el formato (`user-xyz`); la Regla 4 establece el significado (`role: 'admin'`). Sin IDs consistentes, el sistema de roles sería imposible de implementar limpio.

## 4. Convenciones de estructura

### Value Objects

- Constructor privado + `static create()` factory + `static isValid()` (no throw).
- `getValue()`. Inmutables.
- Tests: happy + error cases, `equals()`.

### Entities

- Constructor privado + `static create()` factory.
- Auto-genera ID via `genUUID('prefix')`.
- Getters con `get`. IDs: `<prefix>-<uuid>`.
- Reciben Value Objects pre construidos.

### genUUID

- `domain/utils/genUUID.ts` — `genUUID(prefix)` → `'<prefix>-<crypto.randomUUID()>'`
- Prefijos semánticos: `user-`, `item-`, `config-`, etc.

## 5. Mejoras propuestas

1. **Especificar alcance de "before editing" en Regla 2:** Agregar clarificación sobre si el backup debe incluir el contenido previo o posterior.
2. **Considerar TypedId con branding ligero:** La Regla 3 podría evolucionar a permitir un tipo branded (`UserId = string & {__brand: 'UserId'}`) que mantenga el beneficio de los flat strings pero añada type-safety.
3. **Añadir sección de "reglas temporales" o "reglas de deprecación":** Permitir que reglas se marquen como "deprecated" con vías de migración.

## 6. Conclusión

Las 4 reglas de AGENTS.md forman un sistema de invariantes bien diseñado que balancea flexibilidad operativa con consistencia arquitectónica. Cada regla resuelve una clase de problema distinta: imports (build-time), backup (governance), IDs (data model), member roles (domain model). Su interrelación crea una trama de consistencia que permite a agentes autónomos operar sin fracturar el sistema.
