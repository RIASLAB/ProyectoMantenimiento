import Dexie, { type Table } from 'dexie';

/** Respuesta de una consulta guardada para usarla sin conexión (OFF-04). */
export interface CachedResponse {
  key: string; // ruta de la API, p. ej. "/activos"
  data: unknown;
  guardadoEn: number;
}

/**
 * Registro hecho en el dispositivo que todavía no llega al servidor (OFF-01).
 * Cada uno lleva un clientId; si se reenvía, el servidor no lo duplica (OFF-02).
 */
export interface OutboxItem {
  id?: number;
  /** Solo lo envía el mismo usuario que lo registró: el registro queda a su nombre. */
  usuarioId: string;
  tipo: 'reporte' | 'temperatura' | 'checklist' | 'accion-orden' | 'foto-orden';
  /** Texto corto para mostrarle al usuario qué está pendiente. */
  resumen: string;
  method: 'POST' | 'PUT';
  path: string;
  body?: unknown;
  /** Foto a enviar como multipart (si `path` es de fotos), o a enviar después de crear la OT (reporte). */
  foto?: { blob: Blob; nombre: string; momento: string; clientId: string };
  /** Si existe, se navega a esta OT en la pantalla de pendientes. */
  ordenId?: string;
  estado: 'pendiente' | 'error';
  error?: string;
  intentos: number;
  creadoEn: number;
}

class OfflineDB extends Dexie {
  cache!: Table<CachedResponse, string>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super('cmms-offline');
    this.version(1).stores({
      cache: 'key, guardadoEn',
      outbox: '++id, usuarioId, estado, creadoEn, ordenId',
    });
  }
}

export const db = new OfflineDB();

/** Pide al navegador no borrar estos datos cuando falte espacio (OFF-08). */
export function pedirAlmacenamientoPersistente() {
  try {
    navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* no soportado */
  }
}
