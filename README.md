# CMMS – Nutrialimentos Cárnicos S.A.S.

Sistema de mantenimiento e inventario de repuestos: hoja de vida de máquinas, mantenimientos preventivos y correctivos, inventario, solicitudes de compra, registros de calidad HACCP/BPM e indicadores. Funciona en celular, tablet y PC, y trabaja sin conexión en la planta.

## Estado actual (Sprint 3 terminado)

| Módulo | Estado |
|---|---|
| Base de datos y migraciones | ✅ Listo |
| Inicio de sesión (contraseña / PIN de planta), bloqueo por intentos | ✅ Listo |
| Roles y permisos validados en la API | ✅ Listo |
| Gestión de usuarios | ✅ Listo |
| Autorizador de compras configurable | ✅ Listo |
| Bitácora de auditoría inmutable | ✅ Listo |
| Máquinas: ficha técnica, documentos adjuntos | ✅ Listo |
| Inventario: catálogo, entradas/salidas, kardex, costo promedio, conteo físico, exportación | ✅ Listo |
| Pantallas: login, máquinas, inventario, usuarios, configuración (celular, tablet y PC) | ✅ Listo |
| App instalable en el celular (PWA) | ✅ Listo |
| Órdenes de trabajo: reporte de fallas, asignación, ejecución, cierre con repuestos y mano de obra | ✅ Sprint 2 |
| Planes preventivos con kit de repuestos, avisos y programación automática | ✅ Sprint 2 |
| Hoja de vida y costo acumulado por máquina | ✅ Sprint 2 |
| Solicitudes de compra: automáticas por faltante, aprobación, compra y recepción | ✅ Sprint 2 |
| Calidad: temperaturas con límites críticos, checklists HACCP/BPM, anulaciones, exportación | ✅ Sprint 2 |
| Modo sin conexión: fallas con foto, temperaturas, checklists y ejecución/cierre de OT; sincronización automática | ✅ Sprint 3 |
| Notificaciones: bandeja en la app con contador y avisos al celular (Web Push) | ✅ Sprint 3 |
| Indicadores: disponibilidad, MTBF, MTTR, cumplimiento de preventivos, rotación, gráficos | ✅ Sprint 3 |
| Carga masiva de máquinas y repuestos desde Excel, con validación por fila | ✅ Sprint 3 |
| Producción con Docker y HTTPS, respaldos diarios cifrados con prueba de restauración | ✅ Sprint 3 |

El detalle requisito por requisito está en [docs/trazabilidad.md](docs/trazabilidad.md).
Las decisiones que se asumieron mientras los líderes del proceso las definen están en [docs/decisiones-asumidas.md](docs/decisiones-asumidas.md).

## Tecnologías

- **Backend:** NestJS 11 (Node.js 22), TypeORM, PostgreSQL 16.
- **Frontend:** React 19 + Vite + TanStack Query, como PWA instalable. Sin fuentes ni recursos externos; el service worker guarda la app y Dexie (IndexedDB) guarda los datos y la cola de envíos.
- **Seguridad:** JWT, bcrypt, Helmet, validación estricta de entradas, registros inmutables en base de datos.

## Puesta en marcha (desarrollo)

Requisitos: Node.js 22+, Docker (o un PostgreSQL 13+ propio).

> Docker expone la base de datos en el puerto **5433** para no chocar con un PostgreSQL instalado en el PC. Si usas tu propio PostgreSQL, cambia el puerto a 5432 en `backend/.env`.

```bash
# 1. Base de datos
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env        # ajustar JWT_SECRET y DATABASE_URL si aplica
npm install
npm run migration:run
npm run seed                # crea el usuario "admin" y muestra su contraseña
# npm run seed -- --demo    # opcional: usuarios, máquinas, repuestos, órdenes, compras y calidad de prueba
npm run start:dev           # API en http://localhost:3000/api

# 3. Frontend (otra terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (redirige /api al backend)
```

Para probar desde un celular en la misma red: `npm run dev -- --host` y abrir `http://<IP-del-PC>:5173`.

### Avisos al celular (opcional)

Sin configuración, las notificaciones llegan a la bandeja de la app (campana). Para que lleguen también al celular con la app cerrada:

```bash
cd backend
npm run push:claves        # genera una clave pública y una privada
```

Copie las dos claves en `backend/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), ajuste `VAPID_SUBJECT` y reinicie el backend. Luego cada usuario toca **Activar avisos** en Notificaciones. Requiere la app compilada (`npm run build && npm run preview`, o el despliegue con HTTPS); en iPhone, además, la app agregada a la pantalla de inicio (iOS 16.4 o superior). Las claves se generan una sola vez: si se cambian, cada celular debe activar los avisos de nuevo.

### Producción

Ver **[docs/despliegue.md](docs/despliegue.md)**: `docker-compose.prod.yml` levanta la base, la app (API y app compilada en un solo servicio), los respaldos diarios cifrados y HTTPS automático. La arquitectura y el modelo de datos están en [docs/arquitectura.md](docs/arquitectura.md).

Para probar el modo producción sin Docker: `npm run build` en `frontend` y en `backend`, y luego en `backend` `FRONTEND_DIR=../frontend/dist node dist/main.js` (abre en `http://localhost:3000`).

### Pruebas

```bash
cd backend
npm run test:e2e
```

Las pruebas corren contra una base de datos real (`TEST_DATABASE_URL`, por defecto `cmms_test`), que se borra y se recrea en cada ejecución. Hoy hay **159 pruebas de API**, cada una ligada al requisito de la matriz que verifica.

Además, la carpeta `e2e/` recorre los flujos en un navegador real, en escritorio y en celular (**77 verificaciones**):

| Script | Qué recorre |
|---|---|
| `e2e/flujos.py` | Login, permisos por rol, máquinas, documentos, inventario, usuarios, bitácora |
| `e2e/ordenes.py` | Operario reporta falla en el celular → admin asigna → técnico cierra con repuestos y horas → hoja de vida |
| `e2e/compras.py` | Faltante automático → autorizador aprueba/rechaza → admin compra y recibe en bodega |
| `e2e/calidad.py` | Temperatura fuera de rango, checklist con no conformidad, anulación, exportación, configuración |
| `e2e/eliminar_adjuntos.py` | Eliminar fotos de una orden (quién puede y cuándo) y documentos de una máquina |
| `e2e/carga_masiva.py` | Descarga la plantilla, la llena, la sube con errores (fila y columna), la corrige y carga máquinas y repuestos con stock inicial |
| `e2e/avisos_indicadores.py` | Falla y temperatura fuera de rango → campana y bandeja del admin; asignación → aviso al técnico; indicadores en el celular; horario y metas |
| `e2e/rendimiento.py` | Mide la carga de las pantallas principales con 4G lenta y sin caché (NFR-02); no cuenta verificaciones |
| `e2e/sin_conexion.py` | Se corta la red en el celular: la app abre, se cierra una OT, se registran temperatura y falla con foto; al volver la señal todo se envía solo y un conflicto queda a la vista |

Cada script necesita los datos de demostración recién cargados (`npm run seed -- --demo` sobre una base limpia) y el frontend compilado y servido (`npm run build && npm run preview`).

## API (resumen)

Todas las rutas van bajo `/api` y requieren `Authorization: Bearer <token>`, salvo `POST /auth/login` y `GET /salud`.

| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /auth/login` | Público | `{ usuario, credencial }`: contraseña (Admin/Autorizador) o PIN (Técnico/Operario) |
| `GET /auth/yo` | Todos | Usuario de la sesión |
| `GET/POST /usuarios`, `PATCH /usuarios/:id` | Admin | Gestión de usuarios |
| `GET/PUT /parametros/autorizador` | Todos / Admin | Autorizador de compras vigente |
| `GET /bitacora` | Admin | Bitácora de auditoría con filtros |
| `GET /activos`, `GET /activos/:id`, `GET /activos/areas` | Todos | Máquinas y su ficha |
| `POST /activos`, `PATCH /activos/:id` | Admin | Crear y editar máquinas |
| `POST /activos/:id/documentos` | Admin | Adjuntar PDF/JPG/PNG (campo `archivo`) |
| `GET /activos/documentos/:docId/archivo` | Todos | Descargar documento |
| `GET /repuestos`, `GET /repuestos/:id` | Todos | Catálogo con stock calculado |
| `GET /repuestos/:id/kardex` | Admin, Autorizador | Movimientos con saldo |
| `POST /repuestos`, `PATCH /repuestos/:id` | Admin | Crear y editar repuestos |
| `POST /inventario/movimientos` | Admin | Entradas, salidas y ajustes |
| `POST /inventario/conteos` | Admin | Conteo físico con ajuste automático |
| `GET /inventario/exportar` | Admin, Autorizador | CSV para Excel |
| `GET /ordenes`, `GET /ordenes/:id`, `GET /ordenes/resumen` | Todos (operario: solo las suyas) | Órdenes de trabajo |
| `POST /ordenes` | Todos | Reportar falla |
| `POST /ordenes/:id/asignar` · `iniciar` · `esperar-repuesto` · `reanudar` · `cerrar` | Admin, técnico asignado | Ciclo de la OT |
| `POST /ordenes/:id/cancelar` | Admin | Cancelar con motivo |
| `PUT /ordenes/:id/repuestos` | Admin, técnico asignado | Repuestos planificados (genera faltantes) |
| `POST /ordenes/:id/fotos?momento=` | Reportante, ejecutor | Fotos JPG/PNG |
| `GET/POST /planes`, `PATCH /planes/:id` | Admin (crear) | Planes preventivos |
| `GET /activos/:id/historial` | Todos | Hoja de vida y costo acumulado |
| `GET/POST /compras`, `GET /compras/:id` | Admin, autorizador, técnico | Solicitudes de compra |
| `POST /compras/:id/aprobar` · `rechazar` | Autorizador vigente | Decisión (nunca sobre una propia) |
| `POST /compras/:id/comprar` · `recibir` | Admin | Compra y entrada a bodega |
| `GET/PUT /parametros/tarifa-hora` | Admin | Tarifa de mano de obra |
| `GET /calidad/puntos`, `POST/PATCH` | Todos / Admin | Puntos de control y límites |
| `GET/POST /calidad/temperaturas` | Todos | Registros de temperatura |
| `GET/POST /calidad/plantillas`, `PATCH` | Todos / Admin | Plantillas de checklist |
| `GET/POST /calidad/checklists` | Todos | Checklists diligenciados |
| `POST /calidad/anulaciones` | Admin | Anular un registro con motivo |
| `GET /calidad/exportar/temperaturas` · `checklists` | Admin, Autorizador | CSV para auditoría |
| `GET /notificaciones`, `GET /notificaciones/contador` | Todos | Bandeja propia y número sin leer |
| `POST /notificaciones/:id/leida`, `POST /notificaciones/leidas` | Todos | Marcar una o todas como leídas |
| `GET/POST /notificaciones/push`, `POST /notificaciones/push/baja` · `prueba` | Todos | Avisos al celular de este dispositivo |
| `GET /importacion/:tipo/plantilla` | Admin | Plantilla de Excel (`maquinas` o `repuestos`) |
| `DELETE /ordenes/fotos/:id` | Quien la subió o Admin | Eliminar una foto mientras la orden está abierta |
| `DELETE /activos/documentos/:id` | Admin | Eliminar un documento de una máquina |
| `POST /importacion/:tipo/validar` · `POST /importacion/:tipo` | Admin | Revisar el archivo (errores por fila) · cargarlo completo |
| `GET /indicadores?desde=&hasta=` | Admin, Autorizador | KPI globales y por máquina del período (por defecto, últimos 30 días) |
| `GET/PUT /indicadores/parametros` | Admin, Autorizador / Admin | Horario de producción y metas |

## Principios de diseño

- **El stock no se edita:** es la suma de movimientos inmutables. Un error se corrige con un ajuste, y queda rastro.
- **Permisos en el servidor:** ocultar un botón no es seguridad; cada endpoint valida el rol.
- **Todo cambio crítico va a la bitácora** en la misma transacción que el cambio.
- **Registros de auditoría y calidad inalterables:** bitácora, movimientos de inventario, historial de OT, temperaturas, checklists y anulaciones tienen un trigger en PostgreSQL que impide editarlos o borrarlos.
- **Sin conexión de verdad:** reportes de falla (con foto), temperaturas, checklists, fotos de OT y los cambios de estado y cierre de una OT se guardan en el dispositivo y se envían solos, en orden, cada 20 s o en cuanto vuelve la señal. Cada uno lleva un `clientId` generado en el dispositivo y la hora real del registro, así un reenvío nunca duplica nada.
- **Modo sin conexión solo con la app compilada:** el service worker no funciona con `npm run dev`. Para probarlo use `npm run build && npm run preview` (o el despliegue con HTTPS).
