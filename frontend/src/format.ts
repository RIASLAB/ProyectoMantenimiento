import type { EstadoActivo, EstadoCompra, EstadoOrden, Prioridad, Rol, TipoMovimiento, TipoOrden, UnidadFrecuencia } from './api/types';

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
};

export const ESTADO_TONE: Record<EstadoActivo, 'ok' | 'warn' | 'bad' | 'muted'> = {
  OPERATIVO: 'ok',
  EN_MANTENIMIENTO: 'warn',
  FUERA_DE_SERVICIO: 'bad',
  DADO_DE_BAJA: 'muted',
};

export const MOV_LABEL: Record<TipoMovimiento, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
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
