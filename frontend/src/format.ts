import type { EstadoActivo, Rol, TipoMovimiento } from './api/types';

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
