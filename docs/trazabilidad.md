# Trazabilidad contra la matriz de requisitos

Estado al cierre del Sprint 2 frente a la matriz (`Matriz_Requisitos_CMMS_Nutrialimentos.xlsx`).

- **API ✅**: el backend cumple el criterio y una prueba automática lo verifica (`backend/test/*.e2e-spec.ts`, 91 pruebas).
- **Pantalla ✅**: el flujo existe en la interfaz y lo recorre una prueba en navegador real (`e2e/*.py`, 43 verificaciones, escritorio y celular).
- Ningún requisito pasa a "Cumple" en la matriz hasta validarse en planta con los usuarios.

## Activos y hoja de vida

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| ACT-01 | Ficha técnica | ✅ | ✅ | Código único normalizado, validaciones, operario recibe 403; tipo de equipo y área; varios equipos iguales de una vez; conteo por tipo y área | — |
| ACT-02 | Documentos adjuntos | ✅ | ✅ | PDF validado por firma; quién y cuándo; el administrador puede eliminarlos (queda en bitácora) | Definir tamaño máximo (hoy 20 MB) |
| ACT-03 | Hoja de vida | ✅ | ✅ | Historial de OT por máquina, filtrable desde la lista de OT | — |
| ACT-04 | Costo acumulado (LCC) | ✅ | ✅ | Repuestos + mano de obra + externos; prueba: $300 + $30.000 + $50.000 = $80.300 | Confirmar D-03 |

## Mantenimiento

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| MNT-01 | Reporte rápido de fallas | ✅ | ✅ | Operario en celular con foto y máquina parada; OT correctiva abierta | Prueba cronometrada con operarios |
| MNT-02 | Inicio y fin de parada | ✅ | ✅ | Obligatoria la puesta en marcha al cerrar; no puede ser anterior a la parada | — |
| MNT-03 | Ciclo de la OT | ✅ | ✅ | Transiciones inválidas rechazadas; historial inmutable con usuario y hora | — |
| MNT-04 | Asignación | ✅ | ✅ | Admin asigna/reasigna; técnico toma OT sin asignar | Notificación al técnico (Sprint 3) |
| MNT-05 | Preventivos por tiempo | ✅ | ✅ | Plan genera la OT; al cerrar se programa la siguiente; plan por tipo de equipo para todos los equipos iguales (también los nuevos) | — |
| MNT-06 | Aviso de próximo y vencido | ✅ | ✅ | Insignias "Vence en N d" / "Vencido"; resumen con contadores | Notificación (Sprint 3) |
| MNT-08 | Kit de repuestos | ✅ | ✅ | Lista de materiales por tipo de equipo: se carga en el plan, se copia a cada OT y se ofrece al planificar o cerrar correctivos; el técnico ajusta lo usado | Cargar la lista real de cada tipo de equipo |
| MNT-09 | Descuento automático | ✅ | ✅ | Solo lo usado; movimiento con referencia OT; sin stock no cierra ni descuenta | — |
| MNT-10 | Mano de obra y externos | ✅ | ✅ | Horas por técnico × tarifa vigente; costos congelados al cierre | — |
| MNT-11 | Fotos | ✅ | ✅ | Reporte, antes y después; JPG/PNG validados; una foto equivocada se elimina mientras la OT está abierta (queda en el historial y la bitácora) | — |

## Inventario

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| INV-01 | Catálogo | ✅ | ✅ | Código y unidad normalizados | — |
| INV-02 | Entradas | ✅ | ✅ | Compra exige costo; ajuste exige motivo; recepción de compras | — |
| INV-03 | Salidas con trazabilidad | ✅ | ✅ | Consumo ligado a OT; movimientos inmutables en la base de datos | — |
| INV-04 | Kardex | ✅ | ✅ | Saldo final = stock mostrado | — |
| INV-06 | Stock mínimo | 🟡 | ✅ | Filtro y alerta visual | Sugerir compra automática al bajar del mínimo |
| INV-07 | Conteo físico | ✅ | ✅ | Ajuste por diferencia y bitácora | — |
| INV-08 | Costo promedio | ✅ | ✅ | (1×100 + 3×120) / 4 = 115 en la recepción de una compra | Confirmar D-04 |
| INV-09 | Exportar | ✅ | ✅ | CSV para Excel | — |

## Compras

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| COM-01 | Automática por faltante | ✅ | ✅ | Stock 1, kit pide 3 → solicita 2; no se duplica, se ajusta | — |
| COM-02 | Manual | ✅ | ✅ | Desde Compras, el repuesto o la OT | — |
| COM-03 | Aprobación con un clic | ✅ | ✅ | Solo el autorizador vigente; rechazo con motivo | — |
| COM-04 | Autorizador configurable | ✅ | ✅ | Al cambiarlo, las pendientes pasan al nuevo | — |
| COM-05 | Segregación | ✅ | ✅ | Nadie aprueba lo que pidió; cambio de autorizador en bitácora | Notificar a Dirección (Sprint 3) |
| COM-06 | Flujo tras rechazo | ✅ | ✅ | Queda en la OT con motivo; la OT conserva su estado (D-09) | Confirmar D-09 |
| COM-07 | Seguimiento | ✅ | ✅ | Pendiente → Aprobada → Comprada → Recibida; proveedor y OC | — |
| COM-08 | Entrada y aviso | ✅ | ✅ | Recepción entra al inventario y lo registra en la OT ("ya puede reanudarse") | Aviso al solicitante (Sprint 3) |

## Calidad HACCP/BPM

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| CAL-01 | Registro de temperaturas | ✅ | ✅ | Hora de lectura y de llegada al servidor; usuario; numérico validado | — |
| CAL-02 | Límites y alerta | ✅ | ✅ | Fuera de rango en rojo, en el resumen y en bitácora; los límites quedan congelados en cada registro | Notificación a calidad (Sprint 3); límites reales (D-06) |
| CAL-03 | Acción correctiva obligatoria | ✅ | ✅ | No guarda sin acción si está fuera de rango | — |
| CAL-04 | Checklists configurables | ✅ | ✅ | Sí/No, número y texto; no conformidades resaltadas; copia de las preguntas | Preguntas con foto |
| CAL-05 | Registros inalterables | ✅ | ✅ | Trigger en base de datos; anulación con motivo que no borra | — |
| CAL-06 | Consulta y exportación | ✅ | ✅ | Filtros por fecha y desviaciones; CSV con anulaciones | PDF; retención (D-07) |
| CAL-07 | Registros faltantes | 🟡 | ✅ | Puntos marcados "Toca registrar" según frecuencia | Recordatorio activo (Sprint 3) |

## Seguridad y transversales

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| SEG-01 | Cuentas individuales | ✅ | — | Todo registro guarda su usuario | — |
| SEG-02 | Login de planta | ✅ | ✅ | PIN para técnico y operario | Probar en planta |
| SEG-03 | Roles en la API | ✅ | ✅ | 403 en cada módulo para roles no autorizados | Matriz rol × acción completa |
| SEG-04 | Gestión de usuarios | ✅ | ✅ | Desactivar corta el acceso de inmediato | — |
| SEG-05 | Bitácora | ✅ | ✅ | Inmutable; etiquetas legibles para todas las acciones | — |
| SEG-06 | Seguridad técnica | ✅ | — | Bloqueo por intentos, bcrypt, hashes nunca expuestos, CSP y cabeceras de seguridad, HTTPS (Caddy), respaldos cifrados AES-256, la API no arranca con una clave JWT débil | Revisión de sistemas en el servidor definitivo |
| GEN-01 | Celular, tablet y PC | — | ✅ | 1366 px, Pixel 7 e iPhone 13; sin desplazamiento horizontal; "Más" cuando no caben las pestañas | — |
| GEN-02 | Español | — | ✅ | Todos los textos y errores | Prueba de usabilidad con operarios |
| INT-01 | Carga inicial masiva | ✅ | ✅ | Plantillas de Excel; errores con fila y columna (vacíos, repetidos en el archivo o en el sistema, fechas y números inválidos); totales cargados = archivo; saldo inicial en el kárdex; lee archivos guardados con otros programas | Cargar los datos reales de la planta |
| INT-02 | Código SAP | ✅ | ✅ | Campo `codigoSap` | Acordar codificación (D-13) |

## Modo sin conexión (Sprint 3)

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| OFF-01 | Registro sin conexión | ✅ | ✅ | Fallas, temperaturas, checklists, inicio/pausa/cierre de OT y fotos se guardan en el dispositivo; la hora real viaja con el registro (`e2e/sin_conexion.py`) | Probar en la planta con los celulares reales |
| OFF-02 | Sincronización automática sin duplicados | ✅ | ✅ | Cola en orden cada 20 s y al volver la señal; `clientId` en todo (prueba API "OFF · Sincronización") | — |
| OFF-03 | Indicador de conexión y pendientes | — | ✅ | "Sin conexión", "N por enviar" o "N con error" en la barra; pantalla *Pendientes* | — |
| OFF-04 | Consulta sin conexión | — | ✅ | Máquinas, repuestos, OT abiertas, puntos de control y plantillas se descargan al ingresar y cada 10 min | — |
| OFF-05 | Regla de conflictos | ✅ | ✅ | D-01: gana el primero; el conflicto queda con su motivo para reintentar o descartar | Confirmar D-01 con Carlos |
| OFF-06 | Consumos sin stock | ✅ | ✅ | D-02: el cierre sin conexión descuenta igual y alerta `STOCK_NEGATIVO` | — |
| OFF-07 | Fotos sin conexión | ✅ | ✅ | Foto comprimida guardada en el dispositivo y subida al sincronizar, sin duplicar | — |
| OFF-08 | Persistencia | — | ✅ | IndexedDB: los pendientes sobreviven a recargar o cerrar la app; aviso antes de salir de la sesión | — |

## Notificaciones e indicadores (Sprint 3)

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| NOT-01 | Notificaciones por evento | ✅ | ✅ | Los 6 eventos de la matriz y otros (OT asignada, stock bajo mínimo, checklist no conforme, preventivo vencido); avisos al celular por Web Push; el contador se actualiza cada 30 s (< 1 min) | Confirmar canal (D-10); configurar claves VAPID en el servidor |
| NOT-02 | Bandeja en la app | ✅ | ✅ | Campana con contador, marcar una o todas como leídas, cada usuario ve solo las suyas | — |
| KPI-01 | Disponibilidad | ✅ | ✅ | Coincide con el cálculo manual por máquina y global; período seleccionable | Aprobar fórmula y horario (D-05) |
| KPI-02 | MTBF | ✅ | ✅ | Coincide con el cálculo manual | Aprobar (D-05) |
| KPI-03 | MTTR | ✅ | ✅ | Coincide con el cálculo manual | Aprobar (D-05) |
| KPI-04 | Cumplimiento de preventivos | ✅ | ✅ | A tiempo / (a tiempo + tarde + vencidos) | Aprobar (D-05) |
| KPI-05 | Rotación del inventario | ✅ | ✅ | Consumo / inventario promedio | Aprobar (D-05) |
| KPI-06 | Gráficos | ✅ | ✅ | Máquinas que más fallan, valor del inventario y repuestos bajo mínimo; probado en Pixel 7 sin desplazamiento horizontal | — |
| KPI-07 | Fórmulas y metas aprobadas | — | ✅ | Metas configurables en Ajustes y visibles junto a cada indicador; fórmulas explicadas en pantalla | **Documento aprobado por Dirección** |

## Requisitos no funcionales (Sprint 3)

| ID | Requisito | Estado | Evidencia | Falta |
|---|---|---|---|---|
| NFR-01 | Respaldos automáticos | ✅ | Respaldo diario cifrado de base y archivos con retención y copia opcional a NAS; restauración probada en una base nueva (conteos, app y documentos idénticos; clave errada, archivo dañado y base con datos detectados) | Repetir la prueba de restauración en el servidor definitivo ([despliegue.md](despliegue.md#prueba-de-restauración-antes-de-salir-a-producción-obligatoria)) |
| NFR-02 | Rendimiento en planta | ✅ | Con 4G lenta (1,6 Mbps, 150 ms) y sin caché, las pantallas principales cargan en 2,2 s o menos; con la app instalada, 0,1 s entre pantallas (`e2e/rendimiento.py`) | Medir con el Wi-Fi real de la planta |
| NFR-03 | Infraestructura y despliegue | 🟡 | `docker-compose.prod.yml` (base, app, respaldos, HTTPS); modo producción probado en navegador; guía paso a paso | Decidir servidor (D-12) y construir las imágenes allí (en el entorno de desarrollo no había acceso a Docker Hub) |
| NFR-04 | Documentación técnica | ✅ | [arquitectura.md](arquitectura.md) (componentes, módulos, modelo de datos), [despliegue.md](despliegue.md), README | Que otra persona de sistemas levante el entorno siguiendo la guía |

## Pendiente

Decisiones de los líderes (D-05 metas de KPI, D-06 límites reales, D-07 retención, D-10 canal de avisos, D-12 servidor, D-14 alcance) y la prueba en planta con usuarios reales.
