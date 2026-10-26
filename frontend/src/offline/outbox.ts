import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { api, ApiError, CONEXION, estaEnLinea } from '../api/client';
import { db, type OutboxItem } from './db';

export const SINCRONIZADO = 'cmms:sincronizado';

type NuevoItem = Omit<OutboxItem, 'id' | 'estado' | 'intentos' | 'creadoEn' | 'error'>;

/** Errores por los que conviene reintentar más tarde (red, servidor caído, sesión vencida, demasiadas peticiones). */
const esTransitorio = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500 || [401, 408, 429].includes(e.status));

async function subirFoto(path: string, foto: NonNullable<OutboxItem['foto']>) {
  const fd = new FormData();
  fd.append('archivo', foto.blob, foto.nombre);
  const sep = path.includes('?') ? '&' : '?';
  return api.send('POST', `${path}${sep}momento=${foto.momento}&clientId=${foto.clientId}`, fd);
}

/** Envía un registro al servidor. Si es un reporte con foto, crea la OT y luego sube la foto. */
async function enviar(item: NuevoItem | OutboxItem): Promise<unknown> {
  if (item.tipo === 'foto-orden') return subirFoto(item.path, item.foto!);
  const r = await api.send<{ id?: string }>(item.method, item.path, item.body as object);
  if (item.tipo === 'reporte' && item.foto && r?.id) await subirFoto(`/ordenes/${r.id}/fotos`, item.foto);
  return r;
}

/**
 * Intenta enviar de inmediato; si no hay señal (o la petición se cae), lo guarda en el dispositivo
 * para enviarlo después. Los errores de validación sí se muestran de una vez al usuario.
 */
export async function enviarOEncolar<T = unknown>(
  item: NuevoItem,
  alEncolar?: (body: unknown) => unknown,
): Promise<{ encolado: false; respuesta: T } | { encolado: true }> {
  if (estaEnLinea()) {
    try {
      return { encolado: false, respuesta: (await enviar(item)) as T };
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 0)) throw e;
    }
  }
  await db.outbox.add({
    ...item,
    body: alEncolar ? alEncolar(item.body) : item.body,
    estado: 'pendiente',
    intentos: 0,
    creadoEn: Date.now(),
  });
  return { encolado: true };
}

let sincronizando = false;

/**
 * Envía en orden lo pendiente del usuario actual (OFF-02). Si un registro es rechazado por el servidor
 * (p. ej. otra persona ya cerró la OT: D-01), queda marcado con el error para que el usuario decida.
 */
export async function sincronizar(usuarioId: string | undefined) {
  if (!usuarioId || sincronizando || !navigator.onLine) return;
  sincronizando = true;
  let enviados = 0;
  try {
    const items = await db.outbox.where({ usuarioId, estado: 'pendiente' }).sortBy('creadoEn');
    for (const item of items) {
      try {
        await enviar(item);
        await db.outbox.delete(item.id!);
        enviados++;
      } catch (e) {
        if (esTransitorio(e)) {
          await db.outbox.update(item.id!, { intentos: item.intentos + 1 });
          break; // sin señal o servidor caído: se reintenta en el próximo ciclo, respetando el orden
        }
        await db.outbox.update(item.id!, { estado: 'error', error: e instanceof Error ? e.message : String(e), intentos: item.intentos + 1 });
      }
    }
  } finally {
    sincronizando = false;
    if (enviados) window.dispatchEvent(new Event(SINCRONIZADO));
  }
}

export async function reintentar(id: number, usuarioId: string) {
  await db.outbox.update(id, { estado: 'pendiente', error: undefined });
  await sincronizar(usuarioId);
}

export const descartar = (id: number) => db.outbox.delete(id);

/** Registros del usuario aún sin enviar (se actualiza solo). */
export function usePendientes(usuarioId: string | undefined) {
  return useLiveQuery(
    () => (usuarioId ? db.outbox.where('usuarioId').equals(usuarioId).sortBy('creadoEn') : Promise.resolve([] as OutboxItem[])),
    [usuarioId],
    [] as OutboxItem[],
  );
}

export function useEnLinea() {
  const [v, setV] = useState(estaEnLinea());
  useEffect(() => {
    const f = () => setV(estaEnLinea());
    window.addEventListener(CONEXION, f);
    return () => window.removeEventListener(CONEXION, f);
  }, []);
  return v;
}

/**
 * Reduce las fotos antes de guardarlas o enviarlas (OFF-07): con señal débil, una foto de 4 MB
 * del celular puede no subir nunca. Máximo 1600 px, JPEG calidad 0,8.
 */
export async function comprimirFoto(file: File, maxLado = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    if (escala === 1 && file.size < 600_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // formato que el navegador no puede decodificar: se envía tal cual y el servidor valida
  }
}
