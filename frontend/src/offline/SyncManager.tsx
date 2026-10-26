import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, CONEXION, estaEnLinea } from '../api/client';
import type { ChecklistTemplateInfo, SessionUser, WorkOrderSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/ui';
import { pedirAlmacenamientoPersistente } from './db';
import { SINCRONIZADO, sincronizar, useEnLinea, usePendientes } from './outbox';

const CADA_SYNC_MS = 20_000;
const CADA_PREPARACION_MS = 10 * 60_000;

/**
 * Descarga lo necesario para trabajar sin señal (OFF-04): máquinas, puntos de control, checklists,
 * repuestos y las OT abiertas del usuario. Se guarda en el dispositivo a través de api.get.
 */
async function prepararSinConexion(user: SessionUser) {
  const ignorar = () => undefined;
  const tareas: Array<Promise<unknown>> = [
    api.get('/auth/yo'),
    api.get('/activos'),
    api.get('/repuestos'),
    api.get('/calidad/puntos'),
    api.get<ChecklistTemplateInfo[]>('/calidad/plantillas').then((ps) => Promise.all(ps.map((p) => api.get(`/calidad/plantillas/${p.id}`).catch(ignorar)))),
    api.get<WorkOrderSummary[]>('/ordenes?vista=abiertas').then((os) =>
      // El técnico necesita el detalle de sus OT para iniciarlas o cerrarlas sin señal.
      Promise.all(os.filter((o) => user.rol === 'OPERARIO' || o.asignadoA?.id === user.id || user.rol === 'ADMIN').slice(0, 40)
        .map((o) => api.get(`/ordenes/${o.id}`).catch(ignorar))),
    ),
  ];
  if (user.rol !== 'OPERARIO') tareas.push(api.get('/usuarios/tecnicos'));
  await Promise.all(tareas.map((t) => t.catch(ignorar)));
}

/** Sincroniza la cola y mantiene los datos de referencia al día mientras haya sesión. */
export function SyncManager() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    pedirAlmacenamientoPersistente();
    const sync = () => sincronizar(user.id);
    const preparar = () => { if (estaEnLinea()) prepararSinConexion(user).catch(() => undefined); };
    const alSincronizar = () => qc.invalidateQueries();
    const alCambiarConexion = () => { if (estaEnLinea()) { sync(); preparar(); } };

    sync();
    preparar();
    const t1 = setInterval(sync, CADA_SYNC_MS);
    const t2 = setInterval(preparar, CADA_PREPARACION_MS);
    window.addEventListener('online', sync);
    window.addEventListener(CONEXION, alCambiarConexion);
    window.addEventListener(SINCRONIZADO, alSincronizar);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      window.removeEventListener('online', sync);
      window.removeEventListener(CONEXION, alCambiarConexion);
      window.removeEventListener(SINCRONIZADO, alSincronizar);
    };
  }, [user, qc]);

  return null;
}

/** Indicador de conexión y pendientes (OFF-03). */
export function ConnectionStatus({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const enLinea = useEnLinea();
  const items = usePendientes(user?.id);
  const pendientes = items.filter((i) => i.estado === 'pendiente').length;
  const errores = items.filter((i) => i.estado === 'error').length;

  if (enLinea && !pendientes && !errores) return null;
  const tono = errores ? 'bad' : !enLinea ? 'offline' : 'warn';
  const texto = [
    !enLinea ? 'Sin conexión' : null,
    pendientes ? `${pendientes} por enviar` : null,
    errores ? `${errores} con error` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Link to="/pendientes" className={`conn conn-${tono} ${compact ? 'compact' : ''}`} aria-live="polite">
      <Icon name={!enLinea ? 'stop' : errores ? 'alert' : 'upload'} size={16} />
      <span>{texto}</span>
    </Link>
  );
}
