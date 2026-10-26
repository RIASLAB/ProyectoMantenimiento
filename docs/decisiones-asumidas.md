# Decisiones asumidas

Estas decisiones están pendientes de confirmar por los líderes del proceso (hoja "Decisiones pendientes" de la matriz). Para no frenar el desarrollo se tomó la opción más común. Cada una está aislada en el código para cambiarla sin rehacer el sistema.

| ID | Tema | Lo que se asumió | Dónde se cambia |
|---|---|---|---|
| D-02 | Stock negativo | Una salida hecha en línea (incluido el cierre de una OT) se **bloquea** si no hay stock, sin descontar nada. Un consumo que llegue de una sincronización offline (Sprint 3) se registrará igual, porque el repuesto ya se usó, y generará alerta `STOCK_NEGATIVO` en la bitácora. | `InventoryService.registrarMovimiento` (`permitirNegativo`) |
| D-03 | Costo por máquina (LCC) | Incluye **repuestos + mano de obra + servicios externos**. La mano de obra usa una **tarifa por hora única** configurable en Ajustes. Cada OT congela sus costos al cerrarse, así cambiar la tarifa o el costo promedio después no altera el histórico. | `MaintenanceService.cerrar`, Ajustes → Costo de mano de obra |
| D-04 | Costeo de inventario | **Promedio ponderado.** Solo las compras (incluida la recepción de una solicitud) cambian el promedio; las salidas y los ajustes usan el promedio vigente. | `InventoryService.registrarMovimiento` |
| D-06 | Límites críticos | Cada **punto de control** (equipo + variable) tiene un mínimo y un máximo opcionales y una frecuencia en horas. Los define el administrador; se cargaron ejemplos (cuarto frío 0 a 4 °C, cocción mínimo 72 °C) que **deben reemplazarse por los del plan HACCP**. | Calidad → Configuración |
| D-07 | Registros de calidad | Inalterables (trigger en base de datos). Una corrección se hace con una **anulación con motivo**, que no borra el registro. Se guarda la hora de la lectura y la hora de llegada al servidor. La exportación es CSV; el **tiempo de retención y el formato exigidos por el auditor siguen pendientes**. | `QualityService`, migración `Calidad` |
| D-08 | Cambio de autorizador | La solicitud **no queda atada a una persona**: la decide quien sea el autorizador vigente en ese momento, así las pendientes pasan al nuevo. El autorizador debe tener rol Autorizador y estar activo, y no se le puede desactivar ni cambiar de rol sin asignar a otro. No hay suplente ni niveles por monto (COM-09, posterior). | `PurchasesService.exigirAutorizador`, `UsersService.update` |
| D-09 | Rechazo de compras | La OT **conserva su estado**; el rechazo queda escrito en el historial de la OT con su motivo y mantenimiento decide cómo seguir (reprogramar, pedir otro repuesto o cancelar). | `PurchasesService.rechazar` |
| D-11 | Login en planta | Administrador y Autorizador usan **contraseña** (mínimo 8 caracteres, con letras y números). Técnico y Operario usan **PIN de 4 a 6 dígitos**; se rechazan PIN triviales. Tras 5 intentos fallidos el usuario se bloquea 15 minutos. La sesión dura 8 horas (`JWT_EXPIRES_IN`). | `users/credentials.ts`, `auth/auth.service.ts` |
| D-12 | Infraestructura | PostgreSQL 16 en Docker para desarrollo, en el puerto 5433. Pendiente definir servidor propio o nube para producción. | `docker-compose.yml` |
| D-13 | Codificación SAP | Máquinas y repuestos tienen un campo opcional `codigoSap` además del código interno. | Entidades `Asset`, `SparePart` |
| D-15 | Rol Técnico | Existe el rol **Técnico**, separado del Operario. Cierra la OT el técnico asignado o un administrador. Un técnico puede **tomar** una OT sin asignar, pero no asignársela a otro. | `common/enums.ts`, `MaintenanceService` |

## Otras decisiones de diseño (no estaban en la lista)

| Tema | Lo que se hizo |
|---|---|
| Estado de la máquina | Se calcula solo según sus OT abiertas: con la máquina parada → **Fuera de servicio**; con una OT en ejecución o esperando repuesto → **En mantenimiento**; sin OT abiertas → **Operativo**. Una máquina dada de baja no se toca. Cada cambio queda en la bitácora. |
| Siguiente preventivo | Se programa al cerrar (o cancelar) el anterior, conservando la cadencia desde la fecha programada. Si esa fecha ya pasó, se cuenta desde hoy, para no generar preventivos que nazcan vencidos. Un plan inactivo no genera más órdenes. |
| Faltantes | Al crear un preventivo, cambiar los repuestos planificados o iniciar una OT, se compara lo planificado con el stock y con lo que ya está pedido para esa OT. Si falta, se crea (o se ajusta) **una sola** solicitud pendiente por repuesto. Todavía no hay reserva de stock entre OT (INV-05). |
| Hora de puesta en marcha | El formulario maneja minutos; si la hora indicada queda menos de un minuto antes del inicio de la parada, se ajusta al inicio en vez de rechazar el cierre. |

Las decisiones D-01 (conflictos offline), D-05 (fórmulas de KPI), D-10 (canal de notificaciones) y D-14 (alcance del MVP) corresponden al Sprint 3.
