import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { api, qs } from '../../api/client';
import type { OrdersSummary, WorkOrderSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { OrderBadges } from '../../components/orders-shared';
import { Empty, ErrorBox, Icon, PageHeader, SavedOfflineNotice, Select, Spinner } from '../../components/ui';
import { date, dateTime } from '../../format';
import { useUrlFilters } from '../../hooks';

export function OrdersTabs() {
  const { can } = useAuth();
  const location = useLocation();
  if (!can('ADMIN', 'AUTORIZADOR', 'TECNICO')) return null;
  return (
    <nav className="tabs" aria-label="Secciones de mantenimiento">
      <Link to="/ordenes" className={`tab ${location.pathname === '/ordenes' ? 'active' : ''}`}>Órdenes de trabajo</Link>
      <Link to="/ordenes/planes" className={`tab ${location.pathname === '/ordenes/planes' ? 'active' : ''}`}>Planes preventivos</Link>
    </nav>
  );
}

function Resumen({ onFilter }: { onFilter: (k: string, v: string) => void }) {
  const q = useQuery({ queryKey: ['ordenes-resumen'], queryFn: () => api.get<OrdersSummary>('/ordenes/resumen'), refetchInterval: 60_000 });
  if (!q.data) return null;
  const r = q.data;
  return (
    <div className="chips">
      {r.maquinasParadas > 0 ? <span className="chip chip-bad"><Icon name="stop" size={16} /><strong>{r.maquinasParadas}</strong> máquina{r.maquinasParadas === 1 ? '' : 's'} parada{r.maquinasParadas === 1 ? '' : 's'}</span> : null}
      <button type="button" className={`chip ${r.sinAsignar ? 'chip-bad' : ''}`} onClick={() => onFilter('estado', 'ABIERTA')}><strong>{r.sinAsignar}</strong> sin asignar</button>
      <button type="button" className="chip" onClick={() => onFilter('estado', 'EN_EJECUCION')}><strong>{r.enEjecucion}</strong> en ejecución</button>
      <button type="button" className={`chip ${r.esperandoRepuesto ? 'chip-warn' : ''}`} onClick={() => onFilter('estado', 'ESPERANDO_REPUESTO')}><strong>{r.esperandoRepuesto}</strong> esperando repuesto</button>
      {r.preventivosVencidos > 0 ? <button type="button" className="chip chip-bad" onClick={() => onFilter('tipo', 'PREVENTIVO')}><strong>{r.preventivosVencidos}</strong> preventivo{r.preventivosVencidos === 1 ? '' : 's'} vencido{r.preventivosVencidos === 1 ? '' : 's'}</button> : null}
      {r.preventivosProximos > 0 ? <button type="button" className="chip chip-warn" onClick={() => onFilter('tipo', 'PREVENTIVO')}><strong>{r.preventivosProximos}</strong> preventivo{r.preventivosProximos === 1 ? '' : 's'} próximo{r.preventivosProximos === 1 ? '' : 's'}</button> : null}
    </div>
  );
}

export function OrdersList() {
  const { can, user } = useAuth();
  const location = useLocation();
  const [f, set] = useUrlFilters(['vista', 'tipo', 'estado', 'mias'] as const);
  const vista = f.vista || 'abiertas';
  const operario = user?.rol === 'OPERARIO';

  const list = useQuery({
    queryKey: ['ordenes', vista, f.tipo, f.estado, f.mias],
    queryFn: () => api.get<WorkOrderSummary[]>(`/ordenes${qs({ vista, tipo: f.tipo, estado: f.estado, mias: f.mias })}`),
    refetchInterval: 60_000,
  });

  return (
    <>
      <PageHeader
        title={operario ? 'Mis reportes de falla' : 'Mantenimiento'}
        subtitle={operario ? 'Fallas que usted ha reportado y su estado.' : undefined}
        actions={
          <Link to="/ordenes/reportar" className="btn btn-primary">
            <Icon name="alert" /> Reportar falla
          </Link>
        }
      />
      <SavedOfflineNotice que={(location.state as { guardadoSinConexion?: string } | null)?.guardadoSinConexion} />
      <OrdersTabs />
      {can('ADMIN', 'AUTORIZADOR', 'TECNICO') ? <Resumen onFilter={(k, v) => { set('vista', 'abiertas'); set(k as 'estado', v); }} /> : null}

      <div className="toolbar">
        <Select value={vista} onChange={(e) => { set('vista', e.target.value === 'abiertas' ? '' : e.target.value); set('estado', ''); }} aria-label="Vista">
          <option value="abiertas">Abiertas</option>
          <option value="cerradas">Cerradas y canceladas</option>
          <option value="todas">Todas</option>
        </Select>
        <Select value={f.tipo} onChange={(e) => set('tipo', e.target.value)} aria-label="Tipo">
          <option value="">Correctivos y preventivos</option>
          <option value="CORRECTIVO">Solo correctivos</option>
          <option value="PREVENTIVO">Solo preventivos</option>
        </Select>
        {!operario ? (
          <label className="toggle">
            <input type="checkbox" checked={f.mias === 'true'} onChange={(e) => set('mias', e.target.checked ? 'true' : '')} />
            Solo mías
          </label>
        ) : null}
        {f.estado ? (
          <button type="button" className="chip" onClick={() => set('estado', '')}>Quitar filtro de estado <Icon name="x" size={14} /></button>
        ) : null}
      </div>

      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <Empty title={vista === 'abiertas' ? 'No hay órdenes abiertas' : 'No hay órdenes que coincidan'}>
          {operario ? <p className="muted">Cuando una máquina falle, repórtela con el botón “Reportar falla”.</p> : null}
        </Empty>
      ) : (
        <ul className="list">
          {list.data.map((o) => (
            <li key={o.id}>
              <Link to={`/ordenes/${o.id}`} className="list-row">
                <div className="list-main">
                  <span className="code">{o.codigo} · {o.activo?.codigo}</span>
                  <strong>{o.activo?.nombre}</strong>
                  <span className="muted clamp">{o.descripcion}</span>
                  <div className="list-badges"><OrderBadges o={o} /></div>
                </div>
                <div className="list-meta" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span className="muted">{o.asignadoA ? o.asignadoA.nombre : 'Sin técnico'}</span>
                  <span className="muted small">
                    {o.tipo === 'PREVENTIVO' && o.fechaProgramada ? `Programado ${date(o.fechaProgramada)}` : dateTime(o.creadoEn)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link to="/ordenes/reportar" className="fab" aria-label="Reportar falla">
        <Icon name="alert" /> Reportar falla
      </Link>
    </>
  );
}
