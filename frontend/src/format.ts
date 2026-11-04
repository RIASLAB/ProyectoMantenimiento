import type { ClaseActivo, EstadoActivo, EstadoCompra, EstadoOrden, EtiquetaSiNo, Prioridad, Rol, TipoItem, TipoMovimiento, TipoOrden, UnidadFrecuencia } from './api/types';

export const ROL_LABEL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  AUTORIZADOR: 'Autorizador',
  TECNICO: 'Técnico',
  OPERARIO: 'Operario',
};

export const ESTADO_LABEL: Record<EstadoActivo, string> = {
  OPERATIVO: 'Operativo',
  EN_MANTENIMIENTO: 'En mantenimiento',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
  DADO_DE_BAJA: 'Dado de baja',
  EN_BODEGA: 'En bodega (sin instalar)',
};

export const ESTADO_TONE: Record<EstadoActivo, 'ok' | 'warn' | 'bad' | 'muted' | 'info'> = {
  OPERATIVO: 'ok',
  EN_MANTENIMIENTO: 'warn',
  FUERA_DE_SERVICIO: 'bad',
  DADO_DE_BAJA: 'muted',
  EN_BODEGA: 'info',
};

export const MOV_LABEL: Record<TipoMovimiento, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_INICIAL: 'Saldo inicial',
  ENTRADA_AJUSTE: 'Ajuste (entrada)',
  ENTRADA_DEVOLUCION: 'Devolución',
  SALIDA_CONSUMO: 'Consumo',
  SALIDA_AJUSTE: 'Ajuste (salida)',
};

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

export const money = (n: number) => cop.format(n);
export const qty = (n: number) => num.format(n);

export function date(iso: string | null | undefined) {
  if (!iso) return '—';
  // Las fechas sin hora (AAAA-MM-DD) se muestran tal cual, sin desfase de zona horaria.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Días hasta una fecha AAAA-MM-DD (negativo si ya pasó). */
export function daysUntil(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}


export const ORDEN_ESTADO_LABEL: Record<EstadoOrden, string> = {
  ABIERTA: 'Sin asignar',
  ASIGNADA: 'Asignada',
  EN_EJECUCION: 'En ejecución',
  ESPERANDO_REPUESTO: 'Esperando repuesto',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

export const ORDEN_ESTADO_TONE: Record<EstadoOrden, 'ok' | 'warn' | 'bad' | 'muted' | 'info'> = {
  ABIERTA: 'bad',
  ASIGNADA: 'info',
  EN_EJECUCION: 'warn',
  ESPERANDO_REPUESTO: 'warn',
  CERRADA: 'ok',
  CANCELADA: 'muted',
};

export const TIPO_LABEL: Record<TipoOrden, string> = { CORRECTIVO: 'Correctivo', PREVENTIVO: 'Preventivo' };
export const PRIORIDAD_LABEL: Record<Prioridad, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta' };
/** Al programar un preventivo: la alta es la urgente. */
export const PRIORIDAD_PLAN_LABEL: Record<Prioridad, string> = { ALTA: 'Alta · urgente', MEDIA: 'Media', BAJA: 'Baja · cuando haya tiempo' };
export const PRIORIDAD_TONE: Record<Prioridad, 'bad' | 'warn' | 'muted'> = { ALTA: 'bad', MEDIA: 'warn', BAJA: 'muted' };

/** Fecha (AAAA-MM-DD) más una frecuencia; igual que en el servidor (31 → último día del mes si no existe). */
export function sumarFrecuencia(fecha: string, valor: number, unidad: UnidadFrecuencia) {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (unidad === 'DIAS') d.setUTCDate(d.getUTCDate() + valor);
  else if (unidad === 'SEMANAS') d.setUTCDate(d.getUTCDate() + valor * 7);
  else {
    const dia = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + valor);
    d.setUTCDate(Math.min(dia, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  return d.toISOString().slice(0, 10);
}

/** Hoy (AAAA-MM-DD) en la hora del dispositivo, desplazado n días. */
export function diaLocal(n = 0) {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function frecuencia(valor: number, unidad: UnidadFrecuencia) {
  const u = { DIAS: ['día', 'días'], SEMANAS: ['semana', 'semanas'], MESES: ['mes', 'meses'] }[unidad];
  return valor === 1 ? `Cada ${u[0]}` : `Cada ${valor} ${u[1]}`;
}

/** Duración legible entre dos fechas. */
export function duration(desde: string, hasta: string | null) {
  const ms = (hasta ? new Date(hasta).getTime() : Date.now()) - new Date(desde).getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} días ${h % 24} h`;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const COMPRA_ESTADO_LABEL: Record<EstadoCompra, string> = {
  PENDIENTE: 'Pendiente de aprobación',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  COMPRADA: 'Comprada',
  RECIBIDA: 'Recibida',
  CANCELADA: 'Cancelada',
};

export const COMPRA_ESTADO_TONE: Record<EstadoCompra, 'ok' | 'warn' | 'bad' | 'muted' | 'info'> = {
  PENDIENTE: 'warn',
  APROBADA: 'info',
  RECHAZADA: 'bad',
  COMPRADA: 'info',
  RECIBIDA: 'ok',
  CANCELADA: 'muted',
};

export function rangoTexto(min: number | null, max: number | null) {
  if (min !== null && max !== null) return `${qty(min)} a ${qty(max)} °C`;
  if (min !== null) return `mínimo ${qty(min)} °C`;
  if (max !== null) return `máximo ${qty(max)} °C`;
  return 'sin límites';
}

/** "hace 3 h", "hace 2 días". */
export function hace(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Opciones de un Sí/No según cómo lo muestra el formato (Sí/No, C/NC de los preoperatorios, Bueno/Malo de los tableros). */
export const ETIQUETAS_SI_NO: Record<EtiquetaSiNo, { SI: string; NO: string; corto: { SI: string; NO: string } }> = {
  SI_NO: { SI: 'Sí', NO: 'No', corto: { SI: 'Sí', NO: 'No' } },
  C_NC: { SI: 'Cumple', NO: 'No cumple', corto: { SI: 'C', NO: 'NC' } },
  BUENO_MALO: { SI: 'Sí / Bueno', NO: 'No / Malo', corto: { SI: 'Sí', NO: 'No' } },
};

/** Calificación de los preoperacionales por máquina. */
export const ESCALA: Array<{ v: 'B' | 'R' | 'M' | 'NT' | 'NA'; corto: string; largo: string }> = [
  { v: 'B', corto: 'B', largo: 'Bueno' },
  { v: 'R', corto: 'R', largo: 'Regular' },
  { v: 'M', corto: 'M', largo: 'Malo' },
  { v: 'NT', corto: 'No', largo: 'No tiene' },
  { v: 'NA', corto: 'NA', largo: 'No aplica' },
];

/** Texto de una respuesta de checklist tal como se ve en el formato. */
export function valorChecklist(a: { tipo: TipoItem; valor: string | number | null; etiqueta?: EtiquetaSiNo }, corto = false): string {
  if (a.valor === null || a.valor === undefined || a.valor === '') return '—';
  if (a.valor === 'NA') return corto ? 'NA' : 'No aplica';
  if (a.tipo === 'SI_NO') {
    const e = ETIQUETAS_SI_NO[a.etiqueta ?? 'SI_NO'];
    return a.valor === 'SI' ? (corto ? e.corto.SI : e.SI) : a.valor === 'NO' ? (corto ? e.corto.NO : e.NO) : String(a.valor);
  }
  if (a.tipo === 'ESCALA') {
    const x = ESCALA.find((e) => e.v === a.valor);
    return x ? (corto ? x.corto : x.largo) : String(a.valor);
  }
  return typeof a.valor === 'number' ? qty(a.valor) : String(a.valor);
}

/** Verificaciones de entrega del formato de orden de trabajo (AC-PMT FR03); las mismas que valida la API. */
export const VERIFICACIONES_CIERRE = [
  { id: 'especificaciones', texto: 'Los trabajos de mantenimiento se ejecutaron de acuerdo con las especificaciones técnicas y en el plazo establecido' },
  { id: 'piezas', texto: 'El equipo quedó en óptimas condiciones y con sus piezas completas tras la intervención' },
  { id: 'herramientas', texto: 'Se retiró toda herramienta o material que pueda afectar la inocuidad del producto, el funcionamiento del equipo o la seguridad del trabajador' },
  { id: 'limpieza', texto: 'Se reportó el equipo a limpieza y desinfección para garantizar su correcta limpieza' },
] as const;

export const CLASE_LABEL: Record<ClaseActivo, string> = { EQUIPO: 'Equipo', INSTALACION: 'Instalación (locativo)' };
