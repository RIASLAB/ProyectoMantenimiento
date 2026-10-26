# Trazabilidad contra la matriz de requisitos

Estado al cierre del Sprint 2 frente a la matriz (`Matriz_Requisitos_CMMS_Nutrialimentos.xlsx`).

- **API ✅**: el backend cumple el criterio y una prueba automática lo verifica (`backend/test/*.e2e-spec.ts`, 91 pruebas).
- **Pantalla ✅**: el flujo existe en la interfaz y lo recorre una prueba en navegador real (`e2e/*.py`, 43 verificaciones, escritorio y celular).
- Ningún requisito pasa a "Cumple" en la matriz hasta validarse en planta con los usuarios.

## Activos y hoja de vida

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| ACT-01 | Ficha técnica | ✅ | ✅ | Código único normalizado, validaciones, operario recibe 403 | — |
| ACT-02 | Documentos adjuntos | ✅ | ✅ | PDF validado por firma; quién y cuándo | Definir tamaño máximo (hoy 20 MB) |
| ACT-03 | Hoja de vida | ✅ | ✅ | Historial de OT por máquina, filtrable desde la lista de OT | — |
| ACT-04 | Costo acumulado (LCC) | ✅ | ✅ | Repuestos + mano de obra + externos; prueba: $300 + $30.000 + $50.000 = $80.300 | Confirmar D-03 |

## Mantenimiento

| ID | Requisito | API | Pantalla | Evidencia | Falta |
|---|---|---|---|---|---|
| MNT-01 | Reporte rápido de fallas | ✅ | ✅ | Operario en celular con foto y máquina parada; OT correctiva abierta | Prueba cronometrada con operarios |
| MNT-02 | Inicio y fin de parada | ✅ | ✅ | Obligatoria la puesta en marcha al cerrar; no puede ser anterior a la parada | — |
| MNT-03 | Ciclo de la OT | ✅ | ✅ | Transiciones inválidas rechazadas; historial inmutable con usuario y hora | — |
| MNT-04 | Asignación | ✅ | ✅ | Admin asigna/reasigna; técnico toma OT sin asignar | Notificación al técnico (Sprint 3) |
| MNT-05 | Preventivos por tiempo | ✅ | ✅ | Plan genera la OT; al cerrar se programa la siguiente | — |
| MNT-06 | Aviso de próximo y vencido | ✅ | ✅ | Insignias "Vence en N d" / "Vencido"; resumen con contadores | Notificación (Sprint 3) |
| MNT-08 | Kit de repuestos | ✅ | ✅ | El plan copia el kit a cada OT; el técnico ajusta lo usado | — |
| MNT-09 | Descuento automático | ✅ | ✅ | Solo lo usado; movimiento con referencia OT; sin stock no cierra ni descuenta | — |
| MNT-10 | Mano de obra y externos | ✅ | ✅ | Horas por técnico × tarifa vigente; costos congelados al cierre | — |
| MNT-11 | Fotos | ✅ | ✅ | Reporte, antes y después; JPG/PNG validados | — |

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
| SEG-06 | Seguridad técnica | 🟡 | — | Bloqueo por intentos, bcrypt, hashes nunca expuestos | HTTPS y respaldos cifrados (despliegue) |
| GEN-01 | Celular, tablet y PC | — | ✅ | 1366 px, Pixel 7 e iPhone 13; sin desplazamiento horizontal; "Más" cuando no caben las pestañas | — |
| GEN-02 | Español | — | ✅ | Todos los textos y errores | Prueba de usabilidad con operarios |
| OFF-02 | Sin duplicados al reenviar | 🟡 | 🟡 | `clientId` en fallas, temperaturas, checklists y movimientos | Sincronización completa (Sprint 3) |
| INT-02 | Código SAP | ✅ | ✅ | Campo `codigoSap` | Acordar codificación (D-13) |

## Pendiente para el Sprint 3

Modo sin conexión con sincronización (OFF-01 a OFF-08), notificaciones (NOT-01/02), indicadores (KPI-01 a KPI-07), carga masiva desde Excel (INT-01), respaldos y despliegue (NFR-01/03).
