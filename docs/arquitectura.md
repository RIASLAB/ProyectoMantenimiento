# Arquitectura y modelo de datos

Documento técnico para el equipo de sistemas (NFR-04). Instalación local: [README](../README.md). Producción y respaldos: [despliegue.md](despliegue.md).

## Componentes

| Capa | Tecnología | Carpeta |
|---|---|---|
| App (PWA instalable, funciona sin conexión) | React 19, Vite, TanStack Query, Dexie (IndexedDB), Workbox | `frontend/` |
| API REST | NestJS 11 (Node.js 22), TypeORM 0.3, class-validator | `backend/` |
| Base de datos | PostgreSQL 16 | migraciones en `backend/src/database/migrations` |
| Archivos (manuales, fotos) | Disco del servidor (`UPLOADS_DIR`), nunca en la base | `uploads/activos`, `uploads/ordenes` |
| Avisos al celular | Web Push con claves VAPID (sin servicios de terceros más allá del navegador) | `backend/src/notifications` |

En producción la API también entrega la app compilada (`FRONTEND_DIR`), así todo vive en un solo dominio con HTTPS.

## Módulos del backend (`backend/src`)

| Módulo | Responsabilidad | Requisitos (detalle en [trazabilidad.md](trazabilidad.md)) |
|---|---|---|
| `auth`, `users` | Login con contraseña o PIN, bloqueo por intentos, JWT, roles, usuarios | SEG |
| `audit` | Bitácora inmutable de acciones críticas | SEG-05 |
| `settings` | Parámetros editables (autorizador, tarifa de mano de obra) | COM, D-03 |
| `assets` | Máquinas, ficha técnica, documentos | ACT |
| `inventory` | Repuestos, movimientos, kárdex, costo promedio, conteo físico | INV |
| `maintenance` | Órdenes de trabajo, planes preventivos, hoja de vida y costos | MNT |
| `purchases` | Solicitudes de compra, aprobación, recepción | COM |
| `quality` | Puntos de control, temperaturas, checklists, anulaciones | CAL |
| `notifications` | Bandeja, avisos al celular, preventivos próximos | NOT |
| `kpi` | Indicadores y sus parámetros | KPI |
| `import` | Carga masiva desde Excel | INT-01 |

Reglas transversales:

- **Permisos en el servidor**: un guard global exige sesión en todas las rutas (salvo `@Public`) y comprueba en cada petición que el usuario siga activo; `@Roles(...)` limita cada ruta.
- **Validación estricta**: los DTO rechazan campos no declarados; los archivos se validan por su firma, no por la extensión.
- **Transacciones**: cada cambio y su registro en la bitácora van en la misma transacción; los movimientos de inventario bloquean la fila del repuesto.
- **Idempotencia**: los registros creados en el celular llevan un `client_id` (UUID) generado en el dispositivo; si llegan dos veces (sincronización), no se duplican.

## Modo sin conexión (frontend)

- El service worker guarda la app; cada consulta GET se guarda en IndexedDB y se usa cuando no hay señal.
- Lo que se registra sin señal (fallas con foto, temperaturas, checklists, acciones y cierre de OT) va a una cola local por usuario y se envía en orden cada 20 s o cuando vuelve la señal (`frontend/src/offline`).
- Conflictos (D-01): gana lo primero que llega al servidor; lo rechazado queda en **Pendientes** con el motivo.

## Modelo de datos

22 tablas. Todas las llaves son UUID (`gen_random_uuid()`), salvo `parametros`. Los consecutivos visibles (OT-000123, SC-000045) son columnas `numero` con secuencia.

| Tabla | Contenido | Columnas principales |
|---|---|---|
| `usuarios` | Cuentas y roles (ADMIN, AUTORIZADOR, TECNICO, OPERARIO) | usuario, rol, password_hash / pin_hash, activo, intentos_fallidos, bloqueado_hasta |
| `parametros` | Configuración (clave → valor) | autorizador de compras, tarifa por hora, horario y metas de indicadores |
| `bitacora` 🔒 | Auditoría | usuario_id, accion, entidad, entidad_id, detalle (JSON) |
| `activos` | Máquinas | codigo (único), codigo_sap, nombre, area, ubicacion, fechas de compra y garantía, estado |
| `activo_documentos` | Manuales y fichas | activo_id, archivo, mime, tamano_bytes, subido_por_id |
| `repuestos` | Catálogo de repuestos | codigo (único), descripcion, unidad, stock_minimo, costo_promedio, activo |
| `movimientos_inventario` 🔒 | Kárdex. **El stock es la suma de los movimientos** | repuesto_id, tipo, cantidad (con signo), costo_unitario, referencia, client_id |
| `planes_mantenimiento`, `plan_repuestos` | Preventivos por frecuencia y su kit | activo_id, frecuencia_valor / unidad, dias_aviso, tecnico_id |
| `ordenes_trabajo` | OT correctivas y preventivas | numero, tipo, estado, prioridad, activo_id, inicio_parada / fin_parada, costos congelados al cierre |
| `ot_eventos` 🔒 | Historial de estados de cada OT | orden_id, estado_anterior → estado_nuevo, nota |
| `ot_repuestos`, `ot_mano_obra`, `ot_fotos` | Repuestos planificados/usados, horas por técnico, fotos | orden_id, … |
| `solicitudes_compra` | Compras por faltante o manuales | numero, estado, origen, repuesto_id, orden_id, decisión, compra y recepción |
| `puntos_control` | Variables a medir por equipo | activo_id, minimo, maximo, frecuencia_horas |
| `registros_temperatura` 🔒 | Lecturas | punto_id, valor, límites vigentes, fuera_de_rango, accion_correctiva, registrado_en |
| `plantillas_checklist` | Formatos HACCP/BPM | items (JSON), activo_id opcional |
| `registros_checklist` 🔒 | Checklists llenos | respuestas (JSON), no_conformes, accion_correctiva |
| `anulaciones_calidad` 🔒 | Anulación con motivo de un registro de calidad (no se borra) | tipo, registro_id, motivo |
| `notificaciones` | Bandeja de cada usuario | usuario_id, tipo, titulo, enlace, leida_en, clave (evita duplicados) |
| `suscripciones_push` | Celulares que reciben avisos | usuario_id, endpoint, claves |

🔒 = **solo inserción**: un trigger de PostgreSQL (`fn_registro_inmutable`) impide `UPDATE` y `DELETE`, también para quien entre directo a la base. Las correcciones se hacen con un registro nuevo (ajuste, anulación).

Relaciones principales: una máquina tiene documentos, planes, OT y puntos de control; una OT pertenece a una máquina y puede venir de un plan; consume repuestos (movimientos con `referencia` = OT) y puede originar solicitudes de compra; cada acción queda en la bitácora.

## Cambios de esquema

Nunca se usa `synchronize`. Para cambiar el modelo:

```bash
cd backend
# 1. Cambiar la entidad (*.entity.ts)
npm run migration:generate -- src/database/migrations/NombreDelCambio
# 2. Revisar el SQL generado (TypeORM a veces recrea tipos o tablas sin necesidad)
npm run migration:run
```

En producción, las migraciones pendientes se aplican al arrancar el contenedor (`node dist/database/migrar.js`).

## Pruebas

- `backend/test/*.e2e-spec.ts`: pruebas de API contra PostgreSQL real (`npm run test:e2e`), cada una ligada al requisito que verifica.
- `e2e/*.py`: recorridos en navegador real (Playwright) en PC, Android e iPhone, incluido el modo sin conexión. Requieren `pip install playwright openpyxl`, los datos de demostración y la app compilada.
