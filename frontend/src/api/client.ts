import { db } from '../offline/db';

const TOKEN_KEY = 'cmms.token';
/** Con señal débil una petición puede quedarse colgada: pasado este tiempo se trata como "sin conexión". */
const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  /** `datos`: cuerpo completo de la respuesta de error (ej. la lista de errores por fila de una carga masiva). */
  constructor(public status: number, message: string, public datos?: unknown) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* almacenamiento no disponible */ }
  },
};

/** Se dispara cuando la API responde 401: la sesión expiró o el usuario fue desactivado. */
export const SESSION_EXPIRED = 'cmms:session-expired';

/** Estado de conexión observado (navigator.onLine no es confiable: se combina con el resultado real de las peticiones). */
export const CONEXION = 'cmms:conexion';
let enLinea = typeof navigator === 'undefined' ? true : navigator.onLine;
export const estaEnLinea = () => enLinea;
function marcarConexion(valor: boolean) {
  if (valor !== enLinea) {
    enLinea = valor;
    window.dispatchEvent(new Event(CONEXION));
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => marcarConexion(true));
  window.addEventListener('offline', () => marcarConexion(false));
}

type Body = object | FormData | undefined;

async function raw(path: string, init: { method?: string; body?: Body } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) body = init.body;
  else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    res = await fetch(`/api${path}`, { method: init.method ?? 'GET', headers, body, signal: ctrl.signal });
  } catch {
    marcarConexion(false);
    throw new ApiError(0, 'No hay conexión con el servidor. Revise la red e intente de nuevo.');
  } finally {
    clearTimeout(timer);
  }
  marcarConexion(true);

  if (!res.ok) {
    let message = `Error ${res.status}`;
    let data: unknown;
    try {
      data = await res.json();
      const m = (data as { message?: string | string[] }).message;
      message = Array.isArray(m) ? m.join('. ') : m ?? message;
    } catch { /* respuesta sin JSON */ }
    if (res.status === 401 && token) window.dispatchEvent(new Event(SESSION_EXPIRED));
    if (res.status === 413) message = 'El archivo es demasiado grande';
    throw new ApiError(res.status, message, data);
  }
  return res;
}

/** Respuestas que no se guardan para uso sin conexión (archivos y datos que cambian por segundo). */
const NO_CACHEAR = [/\/exportar/, /\/archivo$/, /\/bitacora/];

export const api = {
  /**
   * GET con respaldo local (OFF-04): cada respuesta se guarda en el dispositivo y, si no hay conexión,
   * se devuelve la última copia guardada.
   */
  async get<T>(path: string): Promise<T> {
    const cacheable = !NO_CACHEAR.some((r) => r.test(path));
    try {
      const data = (await (await raw(path)).json()) as T;
      if (cacheable) db.cache.put({ key: path, data, guardadoEn: Date.now() }).catch(() => undefined);
      return data;
    } catch (e) {
      if (cacheable && e instanceof ApiError && e.status === 0) {
        const c = await db.cache.get(path).catch(() => undefined);
        if (c) return c.data as T;
        throw new ApiError(0, 'Sin conexión y sin datos guardados para esta pantalla. Ábrala una vez con señal.');
      }
      throw e;
    }
  },
  async post<T>(path: string, body?: Body): Promise<T> {
    return (await raw(path, { method: 'POST', body })).json();
  },
  async patch<T>(path: string, body: Body): Promise<T> {
    return (await raw(path, { method: 'PATCH', body })).json();
  },
  async put<T>(path: string, body: Body): Promise<T> {
    return (await raw(path, { method: 'PUT', body })).json();
  },
  async delete<T>(path: string): Promise<T> {
    return (await raw(path, { method: 'DELETE' })).json();
  },
  async send<T>(method: 'POST' | 'PUT', path: string, body?: Body): Promise<T> {
    return (await raw(path, { method, body })).json();
  },
  /** Descarga un archivo protegido (requiere token) como Blob. */
  async blob(path: string): Promise<Blob> {
    return (await raw(path)).blob();
  },
};

/** Abre o descarga un archivo protegido. */
export async function openProtectedFile(path: string, filename: string, download = false) {
  // La pestaña se abre ANTES de esperar la descarga: si se abre después, Safari en iPhone la bloquea
  // como ventana emergente porque ya no viene directamente del toque del usuario.
  const win = download ? null : window.open('', '_blank');
  let blob: Blob;
  try {
    blob = await api.blob(path);
  } catch (e) {
    win?.close();
    throw e;
  }
  const url = URL.createObjectURL(blob);
  if (win) {
    win.opener = null;
    win.location.href = url;
  } else {
    // Descarga explícita, o el navegador bloqueó la pestaña: se descarga el archivo.
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Construye una query string ignorando valores vacíos. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** UUID v4. crypto.randomUUID solo existe en HTTPS/localhost; en la red de planta por HTTP se usa getRandomValues. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
