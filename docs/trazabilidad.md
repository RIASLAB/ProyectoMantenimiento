# Trazabilidad contra la matriz de requisitos

Estado del Sprint 1 frente a la matriz (`Matriz_Requisitos_CMMS_Nutrialimentos.xlsx`).

- **Backend ✅** significa que la API cumple el criterio y hay una prueba automática que lo verifica (`backend/test/app.e2e-spec.ts`).
- **Pantalla ✅** significa que el flujo existe en la interfaz y está cubierto por `e2e/flujos.py` (navegador real, escritorio y celular).
- Ningún requisito pasa a "Cumple" en la matriz hasta validarse en planta con los usuarios.

| ID | Requisito | Backend | Pantalla | Prueba automática | Falta |
|---|---|---|---|---|---|
| ACT-01 | Ficha técnica de máquina | ✅ | ✅ | Crea, normaliza código, rechaza duplicado, valida obligatorios y fechas, operario recibe 403 | — |
| ACT-02 | Documentos adjuntos | ✅ | ✅ | Sube PDF, registra quién subió, descarga, rechaza archivo falso | Definir tamaño máximo (hoy 20 MB) |
| ACT-03 | Hoja de vida | 🟡 Parcial | 🟡 | — | Historial de OT y costos (Sprint 2) |
| INV-01 | Catálogo de repuestos | ✅ | ✅ | Crea con stock 0, código y unidad normalizados | — |
| INV-02 | Entradas de inventario | ✅ | ✅ | Compra exige costo; ajuste exige motivo | — |
| INV-03 | Salidas con trazabilidad | ✅ | ✅ | Consumo exige OT; movimientos inmutables en la base de datos | Vincular a OT real (Sprint 2) |
| INV-04 | Kardex | ✅ | ✅ | Saldo final = stock mostrado | — |
| INV-06 | Alerta stock mínimo | 🟡 Parcial | ✅ | Filtro `bajoMinimo` | Notificación (Sprint 2) |
| INV-07 | Conteo físico | ✅ | ✅ | Genera ajuste por diferencia y bitácora | — |
| INV-08 | Costo promedio | ✅ | ✅ | 10 a $100 + 10 a $200 = promedio $150 | Confirmar D-04 |
| INV-09 | Exportar inventario | ✅ | ✅ | CSV con BOM para Excel | — |
| COM-04 | Autorizador configurable | ✅ | ✅ | Cambio sin código, solo rol Autorizador | Reasignar pendientes (Sprint 2) |
| COM-05 | Segregación | 🟡 Parcial | — | Cambio de autorizador en bitácora | Bloquear autoaprobación (Sprint 2) |
| SEG-01 | Cuentas individuales | ✅ | — | Cada movimiento y cambio registra el usuario | — |
| SEG-02 | Login apto para planta | ✅ | ✅ | PIN para técnico/operario | Probar en planta |
| SEG-03 | Roles validados en API | ✅ | ✅ | Operario recibe 403 al crear máquinas, ver usuarios y ver bitácora | Probar matriz rol × acción completa cuando estén todos los módulos |
| SEG-04 | Gestión de usuarios | ✅ | ✅ | Desactivar corta el acceso de inmediato; no puede desactivarse a sí mismo | — |
| SEG-05 | Bitácora | ✅ | ✅ | Registra cambios con antes/después; no se puede borrar ni editar | — |
| SEG-06 | Seguridad técnica | 🟡 Parcial | — | Bloqueo tras 5 intentos; mensaje genérico; hashes nunca expuestos; bcrypt | HTTPS y respaldos cifrados (despliegue) |
| OFF-02 | Sin duplicados al sincronizar | 🟡 Base | 🟡 | Movimiento con `clientId` repetido no se duplica | Sincronización completa (Sprint 3) |
| INT-02 | Código SAP | ✅ | ✅ | Campo `codigoSap` en máquinas y repuestos | Acordar codificación (D-13) |
| NFR-04 | Documentación técnica | 🟡 Parcial | — | README, decisiones y esta trazabilidad | Modelo de datos y guía de despliegue |

Prueba adicional: dos consumos simultáneos del mismo repuesto no dejan el stock negativo, gracias al bloqueo de fila.

## Requisitos generales verificados en pantalla

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| GEN-01 | Funciona en celular, tablet y PC | ✅ | Pruebas en 1366 px, Pixel 7 e iPhone 13; sin desplazamiento horizontal; botones de 44 px o más; hoja inferior para formularios en celular |
| GEN-02 | Interfaz en español | ✅ | Textos y mensajes de error en español; falta la prueba de usabilidad con operarios |
| OFF-02 | Sin duplicados al reenviar | 🟡 | El formulario de movimientos envía un `clientId`; un doble clic no duplica el registro |
