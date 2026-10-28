export enum Rol {
  ADMIN = 'ADMIN',
  AUTORIZADOR = 'AUTORIZADOR',
  TECNICO = 'TECNICO',
  OPERARIO = 'OPERARIO',
}

export enum EstadoActivo {
  OPERATIVO = 'OPERATIVO',
  EN_MANTENIMIENTO = 'EN_MANTENIMIENTO',
  FUERA_DE_SERVICIO = 'FUERA_DE_SERVICIO',
  DADO_DE_BAJA = 'DADO_DE_BAJA',
  /** Comprada pero sin instalar: está en el inventario de equipos; no genera preventivos ni cuenta en indicadores. */
  EN_BODEGA = 'EN_BODEGA',
}

/**
 * Tipos de movimiento de inventario. El stock de un repuesto es SIEMPRE la suma
 * de sus movimientos (entradas positivas, salidas negativas); nunca se edita directo.
 */
export enum TipoMovimiento {
  ENTRADA_COMPRA = 'ENTRADA_COMPRA',
  /** Saldo con que arranca un repuesto (carga inicial, INT-01). Solo puede ser su primer movimiento. */
  ENTRADA_INICIAL = 'ENTRADA_INICIAL',
  ENTRADA_AJUSTE = 'ENTRADA_AJUSTE',
  ENTRADA_DEVOLUCION = 'ENTRADA_DEVOLUCION',
  SALIDA_CONSUMO = 'SALIDA_CONSUMO',
  SALIDA_AJUSTE = 'SALIDA_AJUSTE',
}

export const TIPOS_ENTRADA = [
  TipoMovimiento.ENTRADA_COMPRA,
  TipoMovimiento.ENTRADA_INICIAL,
  TipoMovimiento.ENTRADA_AJUSTE,
  TipoMovimiento.ENTRADA_DEVOLUCION,
];

export enum TipoOrden {
  CORRECTIVO = 'CORRECTIVO',
  PREVENTIVO = 'PREVENTIVO',
}

/** Ciclo de vida de la OT (MNT-03). Las transiciones válidas están en maintenance/work-order.states.ts */
export enum EstadoOrden {
  ABIERTA = 'ABIERTA',
  ASIGNADA = 'ASIGNADA',
  EN_EJECUCION = 'EN_EJECUCION',
  ESPERANDO_REPUESTO = 'ESPERANDO_REPUESTO',
  CERRADA = 'CERRADA',
  CANCELADA = 'CANCELADA',
}

export enum Prioridad {
  BAJA = 'BAJA',
  MEDIA = 'MEDIA',
  ALTA = 'ALTA',
}

export enum UnidadFrecuencia {
  DIAS = 'DIAS',
  SEMANAS = 'SEMANAS',
  MESES = 'MESES',
}

export enum MomentoFoto {
  REPORTE = 'REPORTE',
  ANTES = 'ANTES',
  DESPUES = 'DESPUES',
}

/** Ciclo de una solicitud de compra (COM-03, COM-07). */
export enum EstadoCompra {
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  COMPRADA = 'COMPRADA',
  RECIBIDA = 'RECIBIDA',
  CANCELADA = 'CANCELADA',
}

export enum OrigenCompra {
  AUTOMATICA = 'AUTOMATICA',
  MANUAL = 'MANUAL',
}
