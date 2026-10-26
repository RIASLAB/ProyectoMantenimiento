import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api/client';
import type { Asset, EstadoActivo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Empty, ErrorBox, Icon, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { ESTADO_LABEL, ESTADO_TONE } from '../../format';
import { useDebounced, useUrlFilters } from '../../hooks';

export function AssetsList() {
  const { can } = useAuth();
  const [filters, set] = useUrlFilters(['q', 'area', 'estado'] as const);
  const { q, area, estado } = filters;
  const dq = useDebounced(q);

  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<string[]>('/activos/areas') });
  const list = useQuery({
    queryKey: ['activos', dq, area, estado],
    queryFn: () => api.get<Asset[]>(`/activos${qs({ q: dq, area, estado })}`),
  });

  return (
    <>
      <PageHeader
        title="Máquinas"
        subtitle={list.data ? `${list.data.length} equipo${list.data.length === 1 ? '' : 's'}` : undefined}
        actions={
          can('ADMIN') ? (
            <Link to="/maquinas/nueva" className="btn btn-primary">
              <Icon name="plus" /> Nueva máquina
            </Link>
          ) : null
        }
      />

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <Input type="search" placeholder="Buscar por código, nombre, modelo o fabricante" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar máquinas" />
        </div>
        <Select value={area} onChange={(e) => set('area', e.target.value)} aria-label="Filtrar por área">
          <option value="">Todas las áreas</option>
          {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={estado} onChange={(e) => set('estado', e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_LABEL) as EstadoActivo[]).map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
        </Select>
      </div>

      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <Empty title={q || area || estado ? 'Ninguna máquina coincide con la búsqueda' : 'Aún no hay máquinas registradas'}>
          {can('ADMIN') && !q && !area && !estado ? <Link to="/maquinas/nueva" className="btn btn-primary">Registrar la primera</Link> : null}
        </Empty>
      ) : (
        <ul className="list">
          {list.data.map((a) => (
            <li key={a.id}>
              <Link to={`/maquinas/${a.id}`} className="list-row">
                <div className="list-main">
                  <span className="code">{a.codigo}</span>
                  <strong>{a.nombre}</strong>
                  <span className="muted">{[a.fabricante, a.modelo].filter(Boolean).join(' · ') || 'Sin modelo registrado'}</span>
                </div>
                <div className="list-meta">
                  <span className="muted">{a.area}{a.ubicacion ? ` · ${a.ubicacion}` : ''}</span>
                  <Badge tone={ESTADO_TONE[a.estado]}>{ESTADO_LABEL[a.estado]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
