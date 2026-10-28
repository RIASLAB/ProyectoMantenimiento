import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';

import { api, qs } from '../../api/client';
import type { Asset, EquipmentModel, EstadoActivo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Empty, ErrorBox, Icon, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { ESTADO_LABEL, ESTADO_TONE } from '../../format';
import { useDebounced, useUrlFilters } from '../../hooks';

/** Secciones de Máquinas: la lista, los tipos de equipo y el conteo por área. */
export function AssetsTabs() {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const tabs: Array<[string, string, boolean]> = [
    ['/maquinas', 'Máquinas', true],
    ['/maquinas/tipos', 'Tipos de equipo', true],
    ['/maquinas/por-area', 'Equipos por área', can('ADMIN', 'AUTORIZADOR', 'TECNICO')],
  ];
  return (
    <nav className="tabs" aria-label="Secciones de máquinas">
      {tabs.filter(([, , ver]) => ver).map(([to, label]) => <Link key={to} to={to} className={`tab ${pathname === to ? 'active' : ''}`}>{label}</Link>)}
    </nav>
  );
}

export function AssetsList() {
  const { can } = useAuth();
  const [filters, set] = useUrlFilters(['q', 'area', 'estado', 'categoriaId', 'modeloId'] as const);
  const { q, area, estado, categoriaId, modeloId } = filters;
  const dq = useDebounced(q);

  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<string[]>('/activos/areas') });
  const tipos = useQuery({ queryKey: ['tipos-equipo'], queryFn: () => api.get<EquipmentModel[]>('/tipos-equipo') });
  const list = useQuery({
    queryKey: ['activos', dq, area, estado, categoriaId, modeloId],
    queryFn: () => api.get<Asset[]>(`/activos${qs({ q: dq, area, estado, categoriaId, modeloId })}`),
  });
  // Un solo selector para categoría o modelo: "c:<id>" o "m:<id>".
  const categorias = [...new Map((tipos.data ?? []).map((t) => [t.categoria.id, t.categoria.nombre])).entries()];
  const tipoValor = modeloId ? `m:${modeloId}` : categoriaId ? `c:${categoriaId}` : '';
  const elegirTipo = (v: string) => { set('categoriaId', v.startsWith('c:') ? v.slice(2) : ''); set('modeloId', v.startsWith('m:') ? v.slice(2) : ''); };
  const filtrando = q || area || estado || categoriaId || modeloId;
  const creados = (useLocation().state as { creados?: number } | null)?.creados;

  return (
    <>
      <PageHeader
        title="Máquinas"
        subtitle={list.data ? `${list.data.length} equipo${list.data.length === 1 ? '' : 's'}${filtrando ? ' con este filtro' : ''}` : undefined}
        actions={
          can('ADMIN') ? (
            <>
              <Link to="/configuracion/carga-masiva?tipo=maquinas" className="btn btn-secondary">
                <Icon name="upload" /> Desde Excel
              </Link>
              <Link to="/maquinas/nueva" className="btn btn-primary">
                <Icon name="plus" /> Nueva máquina
              </Link>
            </>
          ) : null
        }
      />

      <AssetsTabs />
      {creados ? <div className="alert alert-ok">Se registraron {creados} equipos. Abra cada uno para anotar su número de serie.</div> : null}
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <Input type="search" placeholder="Buscar por código, nombre, modelo o fabricante" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar máquinas" />
        </div>
        <Select value={area} onChange={(e) => set('area', e.target.value)} aria-label="Filtrar por área">
          <option value="">Todas las áreas</option>
          {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={tipoValor} onChange={(e) => elegirTipo(e.target.value)} aria-label="Filtrar por tipo de equipo">
          <option value="">Todos los tipos</option>
          {categorias.map(([id, nombre]) => (
            <optgroup key={id} label={nombre}>
              <option value={`c:${id}`}>{nombre} (todos)</option>
              {tipos.data?.filter((t) => t.categoria.id === id).map((t) => <option key={t.id} value={`m:${t.id}`}>{t.nombre}</option>)}
            </optgroup>
          ))}
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
        <Empty title={filtrando ? 'Ninguna máquina coincide con la búsqueda' : 'Aún no hay máquinas registradas'}>
          {can('ADMIN') && !filtrando ? <Link to="/maquinas/nueva" className="btn btn-primary">Registrar la primera</Link> : null}
        </Empty>
      ) : (
        <ul className="list">
          {list.data.map((a) => (
            <li key={a.id}>
              <Link to={`/maquinas/${a.id}`} className="list-row">
                <div className="list-main">
                  <span className="code">{a.codigo}</span>
                  <strong>{a.nombre}</strong>
                  <span className="muted">
                    {a.modeloEquipo ? `${a.modeloEquipo.categoria?.nombre} · ${a.modeloEquipo.nombre}` : [a.fabricante, a.modelo].filter(Boolean).join(' · ') || 'Sin tipo de equipo'}
                  </span>
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
