# Guía de Clean Architecture

## Estructura de Directorios

### 🧠 Domain (Capa más interna)
- **Ubicación:** `backend/src/domain/`
- **Propósito:** Entidades, objetos de valor, agregados y reglas de negocio
- **Dependencias:** NINGUNA (no depende de frameworks ni capas externas)
- **Contenido:**
  - `entities/` → Clases del negocio (User, Product, Order)
  - `value_objects/` → Objetos inmutables (Email, Money, UUID)
  - `aggregates/` → Agregados que agrupan entidades (Order, Cart)
  - `events/` → Eventos de dominio (UserCreated, OrderPlaced)
  - `exceptions/` → Excepciones específicas del dominio

### 🎯 Application (Capa de casos de uso)
- **Ubicación:** `backend/src/application/`
- **Propósito:** Casos de uso, DTOs, puertos (interfaces que Infrastructure implementará)
- **Dependencias:** SOLO de Domain
- **Contenido:**
  - `use_cases/commands/` → Operaciones de escritura (Crear, Actualizar, Eliminar)
  - `use_cases/queries/` → Operaciones de lectura (Obtener, Listar)
  - `dto/` → Objetos de transferencia de datos
  - `ports/` → Interfaces que Infrastructure debe implementar
  - `mappers/` → Conversión entre DTO y Entity

### 🔌 Infrastructure (Capa de adaptadores)
- **Ubicación:** `backend/src/infrastructure/`
- **Propósito:** Implementaciones concretas de puertos, base de datos, API externas
- **Dependencias:** Domain + Application
- **Contenido:**
  - `persistence/` → Repositorios concretos, modelos ORM, migraciones
  - `api/http/` → Clientes para APIs externas
  - `messaging/` → Colas (RabbitMQ, Kafka), productores y consumidores
  - `cache/` → Caché (Redis, Memcached)
  - `logging/` → Configuración de logging
  - `config/` → Configuración desde variables de entorno

### 🖥️ Interfaces (Capa de presentación)
- **Ubicación:** `backend/src/interfaces/`
- **Propósito:** Punto de entrada/salida (API REST, CLI)
- **Dependencias:** Application
- **Contenido:**
  - `api/routes/` → Endpoints FastAPI
  - `api/schemas/` → Schemas Pydantic (entrada/salida)
  - `api/dependencies/` → Inyección de dependencias
  - `api/middlewares/` → Middlewares
  - `cli/` → Comandos CLI

## Reglas de Dependencia
- ✅ Domain NO depende de nada
- ✅ Application depende SOLO de Domain
- ✅ Infrastructure depende de Domain + Application
- ✅ Interfaces depende de Application

## Flujo de Datos (Ejemplo)

1. **Entrada:** Usuario hace POST `/api/users` (Interfaces)
2. **Validación:** Schema Pydantic valida entrada (Interfaces)
3. **Caso de uso:** `CreateUserUseCase` se ejecuta (Application)
4. **Reglas:** Se crea User (Domain)
5. **Persistencia:** Repository guarda en DB (Infrastructure)
6. **Salida:** Response con datos del usuario (Interfaces)

## Buenas Prácticas

1. **Domain primero:** Diseña el negocio antes de pensar en DB o API
2. **Dependencias hacia adentro:** Las capas externas dependen de las internas
3. **No mezclar:** Infrastructure no debe aparecer en Domain
4. **Pruebas aisladas:** Testea Domain sin depender de Infrastructure
5. **Inyección de dependencias:** Usa DI para desacoplar

