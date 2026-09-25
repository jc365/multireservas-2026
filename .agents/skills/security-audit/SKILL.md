---
name: security-audit
description: Realizar auditorías de seguridad exhaustivas en aplicaciones web.
---

# Security Audit Skill

## Propósito
Realizar auditorías de seguridad exhaustivas en aplicaciones web.

## Checklist de auditoría

### 1. Autenticación (JWT)
- [ ] ¿El JWT expira correctamente? (revisar `exp` en payload)
- [ ] ¿El JWT se renueva automáticamente? (refresh token)
- [ ] ¿El token se almacena de forma segura? (httpOnly cookies vs localStorage)
- [ ] ¿Se valida el token en todos los endpoints protegidos?
- [ ] ¿El logout invalida el token correctamente?

### 2. Autorización
- [ ] ¿Un usuario puede acceder a datos de otro usuario?
- [ ] ¿Un user puede acceder a funciones de admin?
- [ ] ¿Un user solo ve sus propios items?
- [ ] ¿Un admin puede ver todo lo que debe?

### 3. Validación de entrada
- [ ] ¿Todos los inputs están sanitizados?
- [ ] ¿Hay protección contra SQL injection? (Prisma ya lo hace)
- [ ] ¿Hay protección contra XSS? (React lo hace automáticamente)
- [ ] ¿Se validan tipos y formatos en el backend?

### 4. Subida de archivos
- [ ] ¿Se validan tipos de archivo? (whitelist)
- [ ] ¿Se valida el tamaño máximo?
- [ ] ¿Los archivos se almacenan con nombres seguros? (UUID, no nombres originales)
- [ ] ¿Los archivos se sirven desde una ruta protegida?
- [ ] ¿Los archivos se eliminan cuando el item se elimina?
- [ ] ¿Hay limpieza automática de archivos antiguos? (cron job)

### 5. Variables de entorno
- [ ] ¿Hay secretos expuestos en el frontend?
- [ ] ¿Las variables de entorno están correctamente configuradas?
- [ ] ¿Hay `.env.example` con valores de ejemplo?

### 6. CORS
- [ ] ¿La configuración de CORS es restrictiva?
- [ ] ¿Solo se permiten los orígenes necesarios?
- [ ] ¿Métodos y headers permitidos están correctamente configurados?

### 7. Logging
- [ ] ¿Se loguean datos sensibles? (contraseñas, tokens)
- [ ] ¿Los logs tienen el nivel adecuado? (info, warn, error)
- [ ] ¿Los logs de error contienen información sensible?

### 8. Producción
- [ ] ¿Forzar HTTPS en producción?
- [ ] ¿Headers de seguridad configurados? (Helmet)
- [ ] ¿Rate limiting configurado?
- [ ] ¿Los endpoints sensibles tienen protección adicional?

### 9. Dependencias
- [ ] ¿Hay dependencias con vulnerabilidades conocidas? (`npm audit`)
- [ ] ¿Las dependencias están actualizadas a versiones seguras?
- [ ] ¿Se usan versiones fijas (no `^` o `~`)? (para producción)

## Cómo usar esta skill

1. **Preparación**: Leer el checklist completo
2. **Ejecución**: Revisar cada punto con el código
3. **Documentación**: Crear informe con hallazgos
4. **Acción**: Priorizar y corregir vulnerabilidades

## Formato de reporte

### Resumen ejecutivo
- Total de hallazgos: X
- Críticos: X
- Altos: X
- Medios: X
- Bajos: X

### Tabla de hallazgos por severidad
| Severidad | Hallazgo | Ubicación | Estado |
|-----------|----------|-----------|--------|
| Crítica | ... | ... | Pendiente |
| Alta | ... | ... | Corregido |

### Hallazgo: [Título descriptivo] por cada hallazgo

**Severidad**: Crítica / Alta / Media / Baja
**Ubicación**: `archivo.ts` línea 42
**Descripción**: [Qué está mal]
**Impacto**: [Qué puede pasar]
**Solución propuesta**: [Cómo arreglarlo]
**Código de ejemplo**: [Código de corrección]

## Priorización de acciones

| Severidad | Acción | Plazo |
|-----------|--------|-------|
| **Crítica** | Corregir inmediatamente | < 24h |
| **Alta** | Corregir en los próximos días | < 1 semana |
| **Media** | Planificar corrección | < 2 semanas |
| **Baja** | Considerar para futuras versiones | < 1 mes |

## Output

El informe de auditoría debe guardarse en:
`.agents/reports/audit-<YYYYMMDD_HHMMSS>.md`

El archivo debe incluir:
- Resumen ejecutivo
- Tabla de hallazgos por severidad
- Detalle de cada hallazgo (severidad, ubicación, descripción, impacto, solución)
- Plan de acción priorizado
- Positive findings