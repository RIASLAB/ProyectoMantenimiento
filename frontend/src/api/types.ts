export type Rol = 'ADMIN' | 'AUTORIZADOR' | 'TECNICO' | 'OPERARIO';
export type EstadoActivo = 'OPERATIVO' | 'EN_MANTENIMIENTO' | 'FUERA_DE_SERVICIO' | 'DADO_DE_BAJA';
export type TipoMovimiento = 'ENTRADA_COMPRA' | 'ENTRADA_AJUSTE' | 'ENTRADA_DEVOLUCION' | 'SALIDA_CONSUMO' | 'SALIDA_AJUSTE';

export interface SessionUser {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
}

export interface User extends SessionUser {
  email: string | null;
  activo: boolean;
  bloqueadoHasta: string | null;
  creadoEn: string;
}

export interface AssetDocument {
  id: string;
  nombreOriginal: string;
  mime: string;
  tamanoBytes: number;
  creadoEn: string;
  subidoPor: { id: string; nombre: string } | null;
}

export interface Asset {
  id: string;
  codigo: string;
  codigoSap: string | null;
  nombre: string;
  modelo: string | null;
  fabricante: string | null;
  serie: string | null;
  area: string;
  ubicacion: string | null;
  fechaCompra: string | null;
  fechaFinGarantia: string | null;
  estado: EstadoActivo;
  notas: string | null;
  documentos?: AssetDocument[];
  creadoEn: string;
  actualizadoEn: string;
}

export interface SparePart {
  id: string;
  codigo: string;
  codigoSap: string | null;
  descripcion: string;
  unidad: string;
  ubicacion: string | null;
  stockMinimo: number;
  costoPromedio: number;
  activo: boolean;
  stock: number;
  valorInventario: number;
  bajoMinimo: boolean;
}

export interface KardexRow {
  id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costoUnitario: number;
  valor: number;
  motivo: string | null;
  referencia: string | null;
  usuario: string | null;
  fecha: string;
  saldo: number;
}

export interface AuditItem {
  id: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: Record<string, unknown> | null;
  creadoEn: string;
  usuario: { id: string; nombre: string } | null;
}

export type TipoOrden = 'CORRECTIVO' | 'PREVENTIVO';
export type EstadoOrden = 'ABIERTA' | 'ASIGNADA' | 'EN_EJECUCION' | 'ESPERANDO_REPUESTO' | 'CERRADA' | 'CANCELADA';
export type Prioridad = 'BAJA' | 'MEDIA' | 'ALTA';
export type UnidadFrecuencia = 'DIAS' | 'SEMANAS' | 'MESES';
export type MomentoFoto = 'REPORTE' | 'ANTES' | 'DESPUES';

export interface PersonRef { id: string; nombre: string }

export interface WorkOrderSummary {
  id: string;
  numero: number;
  codigo: string;
  tipo: TipoOrden;
  estado: EstadoOrden;
  prioridad: Prioridad;
  activoId: string;
  activo?: { id: string; codigo: string; nombre: string; area?: string };
  descripcion: string;
  fechaProgramada: string | null;
  maquinaParada: boolean;
  inicioParada: string | null;
  finParada: string | null;
  asignadoA: PersonRef | null;
  reportadoPor: PersonRef | null;
  creadoEn: string;
  cerradaEn: string | null;
  costoRepuestos: number;
  costoManoObra: number;
  costoServiciosExternos: number;
  costoTotal?: number;
  vencida?: boolean;
  proxima?: boolean;
  diasParaVencer?: number | null;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  activo: Asset;
  plan: { id: string; nombre: string; diasAviso: number } | null;
  iniciadaEn: string | null;
  cerradaPor: PersonRef | null;
  trabajoRealizado: string | null;
  motivoCancelacion: string | null;
  repuestos: Array<{
    id: string; repuestoId: string; cantidadPlanificada: number; cantidadUsada: number | null; costoUnitario: number | null;
    stock: number; faltante: number; repuesto: { id: string; codigo: string; descripcion: string; unidad: string };
  }>;
  manoObra: Array<{ id: string; horas: number; tarifaHora: number; tecnico: PersonRef }>;
  eventos: Array<{ id: string; estadoAnterior: EstadoOrden | null; estadoNuevo: EstadoOrden; nota: string | null; creadoEn: string; usuario: PersonRef | null }>;
  fotos: Array<{ id: string; momento: MomentoFoto; creadoEn: string; subidoPor: PersonRef | null }>;
  acciones: Record<'asignar' | 'tomar' | 'iniciar' | 'esperarRepuesto' | 'reanudar' | 'cerrar' | 'cancelar' | 'editarRepuestos' | 'subirFotos', boolean>;
}

export interface OrdersSummary {
  abiertas: number; sinAsignar: number; enEjecucion: number; esperandoRepuesto: number;
  maquinasParadas: number; preventivosVencidos: number; preventivosProximos: number;
}

export interface Plan {
  id: string;
  activoId: string;
  activo: { id: string; codigo: string; nombre: string };
  nombre: string;
  tareas: string | null;
  frecuenciaValor: number;
  frecuenciaUnidad: UnidadFrecuencia;
  diasAviso: number;
  tecnico: PersonRef | null;
  tecnicoId: string | null;
  vigente: boolean;
  repuestos: Array<{ id: string; repuestoId: string; cantidad: number; repuesto: { id: string; codigo: string; descripcion: string; unidad: string } }>;
}

export interface AssetHistory {
  costos: { repuestos: number; manoObra: number; externos: number; total: number };
  cerradas: { correctivos: number; preventivos: number };
  ordenes: WorkOrderSummary[];
}

export type EstadoCompra = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'COMPRADA' | 'RECIBIDA' | 'CANCELADA';

export interface Purchase {
  id: string;
  numero: number;
  codigo: string;
  estado: EstadoCompra;
  origen: 'AUTOMATICA' | 'MANUAL';
  repuestoId: string;
  repuesto: { id: string; codigo: string; descripcion: string; unidad: string };
  cantidad: number;
  ordenId: string | null;
  orden: { id: string; codigo: string; estado: EstadoOrden; activo?: { id: string; codigo: string; nombre: string } } | null;
  justificacion: string;
  solicitadoPor: PersonRef | null;
  decididaPor: PersonRef | null;
  decididaEn: string | null;
  motivoRechazo: string | null;
  proveedor: string | null;
  numeroOrdenCompra: string | null;
  costoEstimado: number | null;
  compradaEn: string | null;
  cantidadRecibida: number | null;
  costoUnitario: number | null;
  factura: string | null;
  recibidaEn: string | null;
  recibidaPor?: PersonRef | null;
  creadoEn: string;
}

export interface PurchaseDetail extends Purchase {
  stock: number;
  historial: AuditItem[];
  acciones: { aprobar: boolean; rechazar: boolean; comprar: boolean; recibir: boolean; cancelar: boolean; esPropia: boolean };
}
