# CMMS – Nutrialimentos Cárnicos S.A.S.

Sistema de mantenimiento e inventario de repuestos: hoja de vida de máquinas, mantenimientos preventivos y correctivos, inventario, solicitudes de compra, registros de calidad HACCP/BPM e indicadores. Funciona en celular, tablet y PC, y tendrá modo sin conexión para la planta.

## Estado actual (Sprint 2 terminado)

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
| Modo offline y sincronización | ⏳ Sprint 3 |
| Notificaciones (push / bandeja en la app) | ⏳ Sprint 3 |
| Indicadores (KPIs) y carga masiva desde Excel | ⏳ Sprint 3 |

El detalle requisito por requisito está en [docs/trazabilidad.md](docs/trazabilidad.md).
Las decisiones que se asumieron mientras los líderes del proceso las definen están en [docs/decisiones-asumidas.md](docs/decisiones-asumidas.md).

## Tecnologías

- **Backend:** NestJS 11 (Node.js 22), TypeORM, PostgreSQL 16.
- **Frontend:** React 19 + Vite + TanStack Query, como PWA instalable. Sin fuentes ni recursos externos, para que pueda funcionar sin internet en el Sprint 3.
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

### Producción (frontend)

`npm run build` genera `frontend/dist/`, archivos estáticos que se sirven con cualquier servidor web (Nginx, IIS). Ese servidor debe redirigir `/api` al backend y devolver `index.html` para las demás rutas. Para instalar la app en el celular se necesita HTTPS.

### Pruebas

```bash
cd backend
npm run test:e2e
```

Las pruebas corren contra una base de datos real (`TEST_DATABASE_URL`, por defecto `cmms_test`), que se borra y se recrea en cada ejecución. Hoy hay **91 pruebas de API**, cada una ligada al requisito de la matriz que verifica.

Además, la carpeta `e2e/` recorre los flujos en un navegador real, en escritorio y en celular (**43 verificaciones**):

| Script | Qué recorre |
|---|---|
| `e2e/flujos.py` | Login, permisos por rol, máquinas, documentos, inventario, usuarios, bitácora |
| `e2e/ordenes.py` | Operario reporta falla en el celular → admin asigna → técnico cierra con repuestos y horas → hoja de vida |
| `e2e/compras.py` | Faltante automático → autorizador aprueba/rechaza → admin compra y recibe en bodega |
| `e2e/calidad.py` | Temperatura fuera de rango, checklist con no conformidad, anulación, exportación, configuración |

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

## Principios de diseño

- **El stock no se edita:** es la suma de movimientos inmutables. Un error se corrige con un ajuste, y queda rastro.
- **Permisos en el servidor:** ocultar un botón no es seguridad; cada endpoint valida el rol.
- **Todo cambio crítico va a la bitácora** en la misma transacción que el cambio.
- **Registros de auditoría y calidad inalterables:** bitácora, movimientos de inventario, historial de OT, temperaturas, checklists y anulaciones tienen un trigger en PostgreSQL que impide editarlos o borrarlos.
- **Listo para offline:** reportes de falla, temperaturas, checklists y movimientos aceptan un `clientId` generado en el dispositivo y la hora real del registro, así un reenvío al sincronizar no duplica nada.
