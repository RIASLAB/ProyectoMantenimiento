import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { NotificationInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, Empty, ErrorBox, Icon, PageHeader, Spinner } from '../components/ui';
import { hace } from '../format';
import { activarAvisos, desactivarAvisos, EstadoAvisos, estadoAvisos } from '../notifications/push';

type Bandeja = { items: NotificationInfo[]; noLeidas: number };

const ICONO: Array<[RegExp, string]> = [
  [/^FALLA|^OT_/, 'wrench'], [/^COMPRA|^AUTORIZADOR/, 'cart'], [/^TEMPERATURA/, 'thermo'], [/^CHECKLIST/, 'clipboard'],
  [/^STOCK/, 'box'], [/^PREVENTIVO/, 'calendar'],
];
const URGENTE = /^(FALLA_REPORTADA|TEMPERATURA_FUERA_DE_RANGO|STOCK_NEGATIVO|PREVENTIVO_VENCIDO)$/;
const icono = (tipo: string) => ICONO.find(([r]) => r.test(tipo))?.[1] ?? 'bell';

/** Marca una notificación como leída sin esperar al servidor (también se usa al abrir un aviso del celular). */
export function useMarcarLeida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ noLeidas: number }>(`/notificaciones/${id}/leida`),
    onMutate: (id) => {
      const ahora = new Date().toISOString();
      qc.setQueryData<Bandeja>(['notificaciones', 'lista'], (b) => b && {
        ...b, items: b.items.map((n) => (n.id === id && !n.leidaEn ? { ...n, leidaEn: ahora } : n)),
        noLeidas: Math.max(0, b.noLeidas - (b.items.some((n) => n.id === id && !n.leidaEn) ? 1 : 0)),
      });
    },
    onSuccess: (r) => qc.setQueryData(['notificaciones', 'contador'], r),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

/** NOT-02: bandeja de notificaciones. Todo aviso queda aquí aunque no llegue al celular. */
export function Notifications() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const lista = useQuery({
    queryKey: ['notificaciones', 'lista'],
    queryFn: () => api.get<Bandeja>('/notificaciones?limite=100'),
    refetchInterval: 30_000,
  });
  const leer = useMarcarLeida();
  const todas = useMutation({
    mutationFn: () => api.post<{ noLeidas: number }>('/notificaciones/leidas'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });

  const abrir = (n: NotificationInfo) => {
    if (!n.leidaEn) leer.mutate(n.id);
    if (n.enlace) nav(n.enlace);
  };

  const noLeidas = lista.data?.noLeidas ?? 0;
  return (
    <>
      <PageHeader
        title="Notificaciones"
        subtitle={lista.data ? (noLeidas ? `${noLeidas} sin leer` : 'Todo leído') : undefined}
        actions={noLeidas ? <Button variant="ghost" busy={todas.isPending} onClick={() => todas.mutate()}><Icon name="check" /> Marcar todas como leídas</Button> : null}
      />
      <AvisosCelular />
      {lista.isPending ? <Spinner /> : lista.isError ? <ErrorBox error={lista.error} onRetry={() => lista.refetch()} /> : lista.data.items.length === 0 ? (
        <Empty title="No tiene notificaciones">
          <p className="muted">Aquí llegan las fallas reportadas, las órdenes asignadas, las compras, las alertas de calidad y los preventivos próximos.</p>
        </Empty>
      ) : (
        <ul className="list notif-list">
          {lista.data.items.map((n) => (
            <li key={n.id}>
              <button type="button" className={`list-row notif ${n.leidaEn ? '' : 'unread'} ${URGENTE.test(n.tipo) ? 'urgent' : ''}`} onClick={() => abrir(n)}>
                <span className="notif-icon"><Icon name={icono(n.tipo)} /></span>
                <span className="notif-body">
                  <strong>{n.titulo}</strong>
                  {n.cuerpo ? <span className="notif-text">{n.cuerpo}</span> : null}
                  <span className="muted small">{hace(n.creadoEn)}</span>
                </span>
                {n.leidaEn ? null : <span className="notif-dot" aria-label="Sin leer" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const TEXTO: Record<EstadoAvisos, string> = {
  'sin-soporte': 'Este navegador no permite avisos al celular. Las notificaciones le llegan a esta bandeja.',
  'iphone-instalar': 'En iPhone los avisos funcionan con la app instalada: en Safari toque Compartir → “Agregar a inicio” y ábrala desde el ícono (iOS 16.4 o superior).',
  'sin-app': 'Los avisos al celular funcionan con la app instalada (versión publicada). Las notificaciones le llegan a esta bandeja.',
  'sin-servidor': 'Los avisos al celular aún no están configurados en el servidor. Las notificaciones le llegan a esta bandeja.',
  bloqueados: 'Los avisos están bloqueados para esta app. Para recibirlos, permita las notificaciones en la configuración del navegador o del celular.',
  activos: 'Este dispositivo recibe los avisos aunque la app esté cerrada.',
  inactivos: 'Reciba un aviso en este dispositivo cuando llegue una falla, una orden o una alerta, aunque la app esté cerrada.',
};

/** Activación de los avisos al celular para este dispositivo. */
function AvisosCelular() {
  const { user } = useAuth();
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);
  const [probado, setProbado] = useState(false);
  const refrescar = () => estadoAvisos().then(setEstado).catch(() => setEstado('sin-soporte'));
  useEffect(() => { void refrescar(); }, [user?.id]);

  const accion = async (f: () => Promise<unknown>) => {
    setOcupado(true); setError(null); setProbado(false);
    try { await f(); } catch (e) { setError(e); } finally { setOcupado(false); await refrescar(); }
  };
  if (!estado) return null;
  const activos = estado === 'activos';

  return (
    <section className={`card push-card ${activos ? 'ok' : ''}`} aria-label="Avisos en este dispositivo">
      <div className="push-head">
        <Icon name="bell" />
        <div>
          <strong>{activos ? 'Avisos activos en este dispositivo' : 'Avisos en este dispositivo'}</strong>
          <p className="muted small" style={{ margin: '2px 0 0' }}>{TEXTO[estado]}</p>
        </div>
      </div>
      {estado === 'inactivos' ? <Button busy={ocupado} onClick={() => accion(activarAvisos)}>Activar avisos</Button> : null}
      {activos ? (
        <div className="row-actions">
          <Button variant="ghost" busy={ocupado} onClick={() => accion(async () => { await api.post('/notificaciones/push/prueba'); setProbado(true); })}>Enviar aviso de prueba</Button>
          <Button variant="ghost" disabled={ocupado} onClick={() => accion(desactivarAvisos)}>Desactivar</Button>
        </div>
      ) : null}
      {probado ? <p className="small" role="status" style={{ margin: 0 }}>Aviso enviado. Debe aparecer en unos segundos.</p> : null}
      {error ? <ErrorBox error={error} /> : null}
    </section>
  );
}
