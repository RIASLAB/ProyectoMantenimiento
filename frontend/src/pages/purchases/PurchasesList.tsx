import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api/client';
import type { Purchase } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Empty, ErrorBox, Icon, PageHeader, Spinner } from '../../components/ui';
import { COMPRA_ESTADO_LABEL, COMPRA_ESTADO_TONE, dateTime, qty } from '../../format';
import { useUrlFilters } from '../../hooks';
import { NewPurchaseModal } from './NewPurchaseModal';
import { RejectModal } from './PurchaseDetail';

const VISTAS: Array<[string, string]> = [['pendientes', 'Por aprobar'], ['en_proceso', 'Aprobadas y compradas'], ['cerradas', 'Historial']];

export function PurchasesList() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const [f, set] = useUrlFilters(['vista'] as const);
  const vista = f.vista || 'pendientes';
  const [nueva, setNueva] = useState(false);
  const [rechazar, setRechazar] = useState<Purchase | null>(null);

  const autorizador = useQuery({
    queryKey: ['autorizador'],
    queryFn: () => api.get<{ autorizador: { id: string; nombre: string } | null }>('/parametros/autorizador'),
  });
  const soyAutorizador = autorizador.data?.autorizador?.id === user?.id;

  const list = useQuery({
    queryKey: ['compras', vista],
    queryFn: () => api.get<Purchase[]>(`/compras${qs({ vista })}`),
    refetchInterval: 60_000,
  });

  const aprobar = useMutation({
    mutationFn: (id: string) => api.post(`/compras/${id}/aprobar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compras'] }),
  });

  return (
    <>
      <PageHeader
        title="Compras de repuestos"
        subtitle={autorizador.data ? <>Autorizador: <strong>{autorizador.data.autorizador?.nombre ?? 'sin asignar'}</strong></> : undefined}
        actions={can('ADMIN', 'TECNICO') ? <Button onClick={() => setNueva(true)}><Icon name="plus" /> Solicitar compra</Button> : null}
      />
      <nav className="tabs" role="tablist" aria-label="Vistas de compras">
        {VISTAS.map(([v, l]) => (
          <button key={v} type="button" role="tab" className="tab" aria-selected={vista === v} onClick={() => set('vista', v === 'pendientes' ? '' : v)}>{l}</button>
        ))}
      </nav>
      {aprobar.isError ? <ErrorBox error={aprobar.error} /> : null}

      {list.isPending ? <Spinner /> : list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : list.data.length === 0 ? (
        <Empty title={vista === 'pendientes' ? 'No hay solicitudes por aprobar' : 'No hay solicitudes en esta vista'} />
      ) : (
        <ul className="list">
          {list.data.map((s) => {
            const puedeDecidir = soyAutorizador && s.estado === 'PENDIENTE' && s.solicitadoPor?.id !== user?.id;
            return (
              <li key={s.id} className="list-row static">
                <Link to={`/compras/${s.id}`} className="list-main" style={{ textDecoration: 'none' }}>
                  <span className="code">{s.codigo}{s.orden ? ` · ${s.orden.codigo}` : ''}</span>
                  <strong>{qty(s.cantidad)} {s.repuesto.unidad} · {s.repuesto.descripcion}</strong>
                  <span className="muted clamp">{s.justificacion}</span>
                  <span className="muted small">{s.solicitadoPor?.nombre ?? '—'} · {dateTime(s.creadoEn)}</span>
                  <div className="list-badges">
                    <Badge tone={COMPRA_ESTADO_TONE[s.estado]}>{COMPRA_ESTADO_LABEL[s.estado]}</Badge>
                    {s.origen === 'AUTOMATICA' ? <Badge tone="info">Automática por faltante</Badge> : null}
                  </div>
                </Link>
                {puedeDecidir ? (
                  <div className="row-actions">
                    <Button busy={aprobar.isPending && aprobar.variables === s.id} onClick={() => aprobar.mutate(s.id)}>Aprobar</Button>
                    <Button variant="secondary" onClick={() => setRechazar(s)}>Rechazar</Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <NewPurchaseModal open={nueva} onClose={() => setNueva(false)} />
      {rechazar ? <RejectModal compra={rechazar} open onClose={() => setRechazar(null)} /> : null}
    </>
  );
}
