export type Rol = 'ADMIN' | 'AUTORIZADOR' | 'TECNICO' | 'OPERARIO';
export type ClaseActivo = 'EQUIPO' | 'INSTALACION';
export type EstadoActivo = 'OPERATIVO' | 'EN_MANTENIMIENTO' | 'FUERA_DE_SERVICIO' | 'DADO_DE_BAJA' | 'EN_BODEGA';
export type TipoMovimiento = 'ENTRADA_COMPRA' | 'ENTRADA_INICIAL' | 'ENTRADA_AJUSTE' | 'ENTRADA_DEVOLUCION' | 'SALIDA_CONSUMO' | 'SALIDA_AJUSTE';

export interface SessionUser {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
  /** La contraseña o el PIN los puso un administrador: hay que cambiarlos antes de seguir. */
  debeCambiarCredencial?: boolean;
  /** Administrador principal, el dueño del sistema (D-41): enciende o apaga módulos. */
  principal?: boolean;
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
  modeloId: string | null;
  /** Equipo, o instalación para el mantenimiento locativo. */
  clase: ClaseActivo;
  voltaje: string | null;
  amperaje: string | null;
  capacidad: string | null;
  peso: string | null;
  ubicacionManual: string | null;
  /** Tipo de equipo; en la ficha trae además la lista de materiales. */
  modeloEquipo?: EquipmentModelRef | null;
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
  /** Preventivo: día en que realmente se hizo; el siguiente se cuenta desde aquí (D-33). */
  fechaRealizacion?: string | null;
  /** Preventivo terminado: la orden que quedó programada después. */
  siguientePreventivo?: { id: string; codigo: string; fechaProgramada: string | null } | null;
  /** Plan del preventivo, con sus tareas (D-31). */
  plan: {
    id: string; nombre: string; diasAviso: number; frecuenciaValor?: number; frecuenciaUnidad?: UnidadFrecuencia; prioridad?: Prioridad;
    tareas?: string | null; tareasPlan?: Array<{ orden: number; tarea: { id: string; nombre: string; grupo: string | null; descripcion: string | null } }>;
  } | null;
  iniciadaEn: string | null;
  cerradaPor: PersonRef | null;
  trabajoRealizado: string | null;
  verificaciones: Array<{ id: string; texto: string; cumple: boolean }> | null;
  observaciones: string | null;
  motivoCancelacion: string | null;
  repuestos: Array<{
    id: string; repuestoId: string; cantidadPlanificada: number; cantidadUsada: number | null; costoUnitario: number | null;
    stock: number; faltante: number; repuesto: { id: string; codigo: string; descripcion: string; unidad: string };
  }>;
  manoObra: Array<{ id: string; horas: number; tarifaHora: number; tecnico: PersonRef }>;
  eventos: Array<{ id: string; estadoAnterior: EstadoOrden | null; estadoNuevo: EstadoOrden; nota: string | null; creadoEn: string; usuario: PersonRef | null }>;
  fotos: Array<{ id: string; momento: MomentoFoto; creadoEn: string; subidoPor: PersonRef | null }>;
  acciones: Record<'asignar' | 'tomar' | 'iniciar' | 'esperarRepuesto' | 'reanudar' | 'cerrar' | 'cancelar' | 'reprogramar' | 'editarRepuestos' | 'subirFotos', boolean>;
}

export interface OrdersSummary {
  abiertas: number; sinAsignar: number; enEjecucion: number; esperandoRepuesto: number;
  maquinasParadas: number; preventivosVencidos: number; preventivosProximos: number;
}

export interface MaterialRef { id?: string; repuestoId: string; cantidad: number; repuesto: { id: string; codigo: string; descripcion: string; unidad: string } }

/** Lista de materiales que aplica a una máquina: la propia (EQUIPO) o la de su tipo (TIPO). */
export interface MaterialesEquipo { origen: 'EQUIPO' | 'TIPO' | null; tipo: { id: string; nombre: string } | null; materiales: MaterialRef[] }

export interface EquipmentModelRef {
  id: string;
  nombre: string;
  categoriaId?: string;
  categoria?: { id: string; nombre: string };
  fabricante?: string | null;
  referencia?: string | null;
  materiales?: MaterialRef[];
}

export interface EquipmentModel extends EquipmentModelRef {
  categoriaId: string;
  categoria: { id: string; nombre: string };
  fabricante: string | null;
  referencia: string | null;
  descripcion: string | null;
  materiales: MaterialRef[];
  equipos: number | Array<{ id: string; codigo: string; nombre: string; area: string; estado: EstadoActivo }>;
}

export interface ResumenEquipos {
  total: number;
  enUso: number;
  enBodega: number;
  filas: Array<{ categoriaId: string | null; categoria: string; modeloId: string | null; modelo: string | null; area: string; total: number; operativos: number; enMantenimiento: number; fueraDeServicio: number; dadosDeBaja: number; enBodega: number }>;
}

export interface Plan {
  id: string;
  /** Plan de una máquina, o plan por tipo de equipo (activo vacío y modeloEquipo lleno). */
  activoId: string | null;
  activo: { id: string; codigo: string; nombre: string; area: string } | null;
  modeloId: string | null;
  modeloEquipo: { id: string; nombre: string; categoria: { id: string; nombre: string } } | null;
  /** Plan de un equipo creado desde el plan de su tipo. */
  plantillaId: string | null;
  primeraFecha: string | null;
  nombre: string;
  tareas: string | null;
  frecuenciaValor: number;
  frecuenciaUnidad: UnidadFrecuencia;
  diasAviso: number;
  /** Prioridad con que salen sus órdenes; el plan no lleva técnico (D-31). */
  prioridad: Prioridad;
  tareasPlan: Array<{ id: string; tareaId: string; orden: number; tarea: MaintenanceTask }>;
  vigente: boolean;
  repuestos: Array<{ id: string; repuestoId: string; cantidad: number; repuesto: { id: string; codigo: string; descripcion: string; unidad: string } }>;
}

/** Tarea del catálogo de mantenimiento (D-31). */
export interface MaintenanceTask { id: string; nombre: string; grupo: string | null; descripcion: string | null; activa: boolean; planes?: number }

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

export interface ControlPointInfo {
  id: string;
  nombre: string;
  vigente: boolean;
  activoId: string;
  minimo: number | null;
  maximo: number | null;
  frecuenciaHoras: number | null;
  activo: { id: string; codigo: string; nombre: string; area: string };
  ultimo: { valor: number | null; estado: EstadoLectura; registradoEn: string; fueraDeRango: boolean } | null;
  atrasado: boolean;
}

export interface QualityVoidInfo { motivo: string; creadoEn: string; usuario: PersonRef }

/** D-37: lectura con temperatura, cuarto en descanso (D) o dañado (F, fuera de servicio). */
export type EstadoLectura = 'LECTURA' | 'DESCANSO' | 'DANADO';

export interface TemperatureRecordInfo {
  id: string;
  valor: number | null;
  estado: EstadoLectura;
  observacion: string | null;
  limiteMinimo: number | null;
  limiteMaximo: number | null;
  fueraDeRango: boolean;
  accionCorrectiva: string | null;
  registradoEn: string;
  creadoEn: string;
  punto: { id: string; nombre: string };
  activo: { id: string; codigo: string; nombre: string };
  usuario: PersonRef;
  anulacion: QualityVoidInfo | null;
}

export type TipoItem = 'SI_NO' | 'NUMERO' | 'TEXTO' | 'ESCALA' | 'SECCION';
export type EtiquetaSiNo = 'SI_NO' | 'C_NC' | 'BUENO_MALO';
export interface ChecklistItemInfo {
  id: string; texto: string; tipo: TipoItem; obligatorio: boolean; esperado?: 'SI' | 'NO'; etiqueta?: EtiquetaSiNo; permiteNA?: boolean;
  minimo?: number | null; maximo?: number | null;
}

export interface ChecklistTemplateInfo {
  id: string;
  nombre: string;
  area: string | null;
  activoId: string | null;
  activo: { id: string; codigo: string; nombre: string } | null;
  descripcion: string | null;
  codigo: string | null;
  version: string | null;
  fechaElaboracion: string | null;
  fechaActualizacion: string | null;
  recomendacion: string | null;
  recordarHora: number | null;
  items: ChecklistItemInfo[];
  vigente: boolean;
}

export interface ChecklistRecordInfo {
  id: string;
  plantillaId: string;
  plantillaNombre: string;
  activo: { id: string; codigo: string; nombre: string } | null;
  respuestas: Array<{ itemId: string; texto: string; tipo: TipoItem; valor: string | number | null; conforme: boolean; observacion?: string | null }>;
  noConformes: number;
  observaciones: string | null;
  accionCorrectiva: string | null;
  registradoEn: string;
  creadoEn: string;
  usuario: PersonRef;
  anulacion: QualityVoidInfo | null;
}

export interface FormatoDocumental { nombre: string; codigo: string; version: string; fechaElaboracion: string | null; fechaActualizacion: string | null }

export interface PlanillaTemperaturas {
  fecha: string;
  area: string;
  formato: FormatoDocumental | null;
  puntos: Array<{ id: string; nombre: string; minimo: number | null; maximo: number | null; frecuenciaHoras: number | null; activo: { id: string; codigo: string; nombre: string; ubicacion: string | null } }>;
  lecturas: Array<{ id: string; puntoId: string; valor: number | null; estado: EstadoLectura; observacion: string | null; fueraDeRango: boolean; accionCorrectiva: string | null; registradoEn: string; hora: string; franja: number; usuario: string }>;
  realizadoPor: string[];
  verificacion: { usuario: string; creadoEn: string; observaciones: string | null } | null;
}

export interface LightingRoomType { id: string; nombre: string; minimo: number; promedio: number; maximo: number }
export interface LightingPoint { id: string; nombre: string; recintoId: string; orden: number; vigente: boolean; recinto: LightingRoomType }
export interface LightingSurvey {
  id: string; fecha: string; empresa: string; lugar: string; evaluador: string; cargoEvaluador: string; observaciones: string | null;
  puntosCumplen: number; puntosNoCumplen: number; usuario: PersonRef; creadoEn: string;
}
export interface LightingSurveyDetail extends LightingSurvey {
  formato: FormatoDocumental | null;
  lecturas: Array<{
    id: string; orden: number; puntoNombre: string; recintoNombre: string; refMinimo: number; refPromedio: number; refMaximo: number;
    medicion1: number; medicion2: number; medicion3: number; media: number; cumple: boolean; planAccion: string | null; observaciones: string | null;
  }>;
}

export type TipoInstrumento = 'TERMOMETRO' | 'LUXOMETRO' | 'BASCULA' | 'MANOMETRO' | 'MULTIMETRO' | 'OTRO';
export type EstadoCalibracion = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA' | 'SIN_CALIBRAR' | 'NO_APTO';
export interface InstrumentInfo {
  id: string; codigo: string; nombre: string; tipo: TipoInstrumento; marca: string | null; modelo: string | null; serie: string | null;
  area: string; ubicacion: string | null; rango: string | null; frecuenciaMeses: number; vigente: boolean; estado: EstadoCalibracion;
  ultima?: { fecha: string; venceEn: string; resultado: 'APTO' | 'NO_APTO'; laboratorio: string } | null;
}
export interface CalibrationInfo {
  id: string; fecha: string; venceEn: string; laboratorio: string; numeroCertificado: string | null; resultado: 'APTO' | 'NO_APTO';
  observaciones: string | null; archivoNombre: string | null; archivoMime: string | null; usuario: PersonRef; creadoEn: string;
}
export interface InstrumentDetail extends InstrumentInfo { calibraciones: CalibrationInfo[] }

export interface QualitySummary {
  temperaturas24h: number; desviaciones24h: number; checklists24h: number; checklistsNoConformes24h: number; puntosAtrasados: number;
}

export interface NotificationInfo {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  leidaEn: string | null;
  creadoEn: string;
}

export interface KpiParams {
  dias: number[];
  horaInicio: string;
  horaFin: string;
  metas: { disponibilidad: number | null; mtbf: number | null; mttr: number | null; cumplimiento: number | null; rotacion: number | null };
}

export interface KpiMachine {
  id: string; codigo: string; nombre: string; area: string; estado: string;
  horasPlanificadas: number; horasParada: number; disponibilidad: number | null;
  fallas: number; mtbfHoras: number | null; reparaciones: number; mttrHoras: number | null;
}

export interface KpiReport {
  periodo: { desde: string; hasta: string; dias: number; calculadoEn: string };
  parametros: KpiParams;
  metas: KpiParams['metas'];
  global: {
    maquinas: number; horasPlanificadas: number; horasParada: number; disponibilidad: number | null;
    fallas: number; mtbfHoras: number | null; reparaciones: number; mttrHoras: number | null;
    preventivos: { programados: number; aTiempo: number; tarde: number; vencidos: number; enPlazo: number; cancelados: number; cumplimiento: number | null };
    inventario: { consumo: number; valorInicial: number; valorFinal: number; valorPromedio: number; rotacion: number | null; diasCobertura: number | null };
  };
  maquinas: KpiMachine[];
  inventarioActual: {
    repuestos: number; valorTotal: number; bajoMinimo: number; sinStock: number;
    criticos: Array<{ id: string; codigo: string; descripcion: string; unidad: string; stock: number; minimo: number }>;
  };
}
