# Decisiones asumidas

Estas decisiones están pendientes de confirmar por los líderes del proceso (hoja "Decisiones pendientes" de la matriz). Para no frenar el desarrollo se tomó la opción más común. Cada una está aislada en el código para cambiarla sin rehacer el sistema.

| ID | Tema | Lo que se asumió | Dónde se cambia |
|---|---|---|---|
| D-02 | Stock negativo | Una salida hecha en línea se **bloquea** si no hay stock. Un consumo que llega de una sincronización offline se **registra igual**, porque el repuesto ya se usó físicamente, y se genera alerta `STOCK_NEGATIVO` en la bitácora. | `InventoryService.registrarMovimiento` (`permitirNegativo`) |
| D-04 | Costeo de inventario | **Promedio ponderado.** Solo las compras cambian el promedio; las salidas y los ajustes usan el promedio vigente. | `InventoryService.registrarMovimiento` |
| D-08 | Cambio de autorizador | El autorizador debe tener el rol Autorizador y estar activo. No se puede desactivar ni cambiar de rol al autorizador vigente sin asignar antes a otro. Las solicitudes pendientes se reasignarán cuando exista el módulo de compras. | `SettingsService`, `UsersService.update` |
| D-11 | Login en planta | Administrador y Autorizador usan **contraseña** (mínimo 8 caracteres, con letras y números). Técnico y Operario usan **PIN de 4 a 6 dígitos**; se rechazan PIN triviales. Tras 5 intentos fallidos el usuario se bloquea 15 minutos. La sesión dura 8 horas (`JWT_EXPIRES_IN`). | `users/credentials.ts`, `auth/auth.service.ts` |
| D-12 | Infraestructura | PostgreSQL 16 en Docker para desarrollo. Pendiente definir servidor propio o nube para producción. | `docker-compose.yml` |
| D-13 | Codificación SAP | Máquinas y repuestos tienen un campo opcional `codigoSap` además del código interno. | Entidades `Asset`, `SparePart` |
| D-15 | Rol Técnico | Se creó el rol **Técnico** separado del Operario. | `common/enums.ts` |

Las decisiones D-01, D-03, D-05, D-06, D-07, D-09, D-10 y D-14 afectan módulos de los sprints 2 y 3. Se documentarán aquí cuando se construyan.
