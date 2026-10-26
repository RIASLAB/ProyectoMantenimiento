import { api } from '../api/client';

/**
 * Avisos al celular (Web Push, NOT-01). Funciona en Android/PC con Chrome, Edge o Firefox,
 * y en iPhone (iOS 16.4+) solo con la app agregada a la pantalla de inicio.
 */
export type EstadoAvisos =
  | 'sin-soporte' | 'iphone-instalar' | 'sin-app' | 'sin-servidor' | 'bloqueados' | 'activos' | 'inactivos';

export const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registro() {
  if (!('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

let clave: Promise<string | null> | null = null;
function clavePublica() {
  clave ??= api.get<{ clavePublica: string | null }>('/notificaciones/push').then((r) => r.clavePublica).catch(() => { clave = null; return null; });
  return clave;
}

function aBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soportado()) return esIOS() && !instalada() ? 'iphone-instalar' : 'sin-soporte';
  const reg = await registro();
  if (!reg) return 'sin-app'; // modo desarrollo (npm run dev): no hay service worker
  if (!(await clavePublica())) return 'sin-servidor';
  if (Notification.permission === 'denied') return 'bloqueados';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'activos' : 'inactivos';
}

async function enviarSuscripcion(sub: PushSubscription) {
  const j = sub.toJSON();
  await api.post('/notificaciones/push', { endpoint: j.endpoint, keys: j.keys });
}

/** Pide permiso (debe llamarse al tocar un botón) y registra este dispositivo para el usuario actual. */
export async function activarAvisos() {
  const reg = await registro();
  const k = await clavePublica();
  if (!reg || !k) throw new Error('Los avisos no están disponibles en este dispositivo');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No se dio permiso para mostrar avisos');
  let sub = await reg.pushManager.getSubscription();
  // Si el servidor cambió de claves, la suscripción vieja ya no sirve.
  const actual = sub?.options.applicationServerKey;
  if (sub && actual && btoa(String.fromCharCode(...new Uint8Array(actual))) !== btoa(String.fromCharCode(...aBytes(k)))) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(k) });
  await enviarSuscripcion(sub);
}

/** Al iniciar sesión: si este dispositivo ya tenía avisos permitidos, quedan a nombre de quien ingresó. */
export async function reasociarAvisos() {
  if (!soportado() || Notification.permission !== 'granted') return;
  const reg = await registro();
  if (!reg || !(await clavePublica())) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await enviarSuscripcion(sub);
  else await activarAvisos();
}

/** Desactiva los avisos de este dispositivo (botón "Desactivar"). */
export async function desactivarAvisos() {
  const sub = await (await registro())?.pushManager.getSubscription();
  if (!sub) return;
  await api.post('/notificaciones/push/baja', { endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => undefined);
}

/**
 * Al cerrar sesión el dispositivo deja de recibir los avisos de ese usuario. El permiso del navegador se conserva,
 * así quien ingrese después sigue recibiendo los suyos sin volver a activarlos.
 */
export async function soltarAvisos(token: string | null) {
  if (!token || !soportado()) return;
  const sub = await (await registro())?.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/api/notificaciones/push/baja', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
}
