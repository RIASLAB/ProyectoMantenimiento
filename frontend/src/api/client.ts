const TOKEN_KEY = 'cmms.token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
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
  try {
    res = await fetch(`/api${path}`, { method: init.method ?? 'GET', headers, body });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revise la red e intente de nuevo.');
  }

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join('. ') : data.message ?? message;
    } catch { /* respuesta sin JSON */ }
    if (res.status === 401 && token) window.dispatchEvent(new Event(SESSION_EXPIRED));
    if (res.status === 413) message = 'El archivo es demasiado grande';
    throw new ApiError(res.status, message);
  }
  return res;
}

export const api = {
  async get<T>(path: string): Promise<T> {
    return (await raw(path)).json();
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
