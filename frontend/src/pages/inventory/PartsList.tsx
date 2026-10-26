import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, openProtectedFile, qs } from '../../api/client';
import type { SparePart } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Empty, ErrorBox, Icon, Input, PageHeader, Spinner } from '../../components/ui';
import { money, qty } from '../../format';
import { useDebounced, useUrlFilters } from '../../hooks';

export function PartsList() {
  const { can } = useAuth();
  const [filters, set] = useUrlFilters(['q', 'bajoMinimo'] as const);
  const q = filters.q;
  const bajoMinimo = filters.bajoMinimo === 'true';
  const dq = useDebounced(q);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const list = useQuery({
    queryKey: ['repuestos', dq, bajoMinimo],
    queryFn: () => api.get<SparePart[]>(`/repuestos${qs({ q: dq, bajoMinimo })}`),
  });

  const total = list.data?.reduce((s, p) => s + p.valorInventario, 0) ?? 0;
  const bajos = list.data?.filter((p) => p.bajoMinimo).length ?? 0;

  const exportar = async () => {
    setExporting(true);
    setExportError('');
    try {
      await openProtectedFile('/inventario/exportar', `inventario-repuestos-${new Date().toISOString().slice(0, 10)}.csv`, true);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Inventario de repuestos"
        subtitle={
          list.data && !q && !bajoMinimo ? (
            <>
              {list.data.length} repuestos · valor {money(total)}
              {bajos > 0 ? <> · <span className="text-warn">{bajos} bajo el mínimo</span></> : null}
            </>
          ) : undefined
        }
        actions={
          <>
            {can('ADMIN', 'AUTORIZADOR') ? (
              <Button variant="secondary" busy={exporting} onClick={exportar}>
                <Icon name="download" /> Exportar
              </Button>
            ) : null}
            {can('ADMIN') ? (
              <>
                <Link to="/configuracion/carga-masiva?tipo=repuestos" className="btn btn-secondary">
                  <Icon name="upload" /> Desde Excel
                </Link>
                <Link to="/inventario/nuevo" className="btn btn-primary">
                  <Icon name="plus" /> Nuevo repuesto
                </Link>
              </>
            ) : null}
          </>
        }
      />
      {exportError ? <div className="alert alert-bad">{exportError}</div> : null}

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <Input type="search" placeholder="Buscar por código, descripción o código SAP" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar repuestos" />
        </div>
        <label className="toggle">
          <input type="checkbox" checked={bajoMinimo} onChange={(e) => set('bajoMinimo', e.target.checked ? 'true' : '')} />
          Solo bajo el mínimo
        </label>
      </div>

      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <Empty title={q || bajoMinimo ? 'Ningún repuesto coincide' : 'Aún no hay repuestos registrados'}>
          {can('ADMIN') && !q && !bajoMinimo ? <Link to="/inventario/nuevo" className="btn btn-primary">Registrar el primero</Link> : null}
        </Empty>
      ) : (
        <ul className="list">
          {list.data.map((p) => (
            <li key={p.id}>
              <Link to={`/inventario/${p.id}`} className="list-row">
                <div className="list-main">
                  <span className="code">{p.codigo}</span>
                  <strong>{p.descripcion}</strong>
                  <span className="muted">{p.ubicacion ?? 'Sin ubicación'}</span>
                </div>
                <div className="list-meta stock">
                  <span className={`stock-qty ${p.stock < 0 ? 'text-bad' : p.bajoMinimo ? 'text-warn' : ''}`}>
                    {qty(p.stock)} <small>{p.unidad}</small>
                  </span>
                  {p.stock < 0 ? <Badge tone="bad">Negativo</Badge> : p.bajoMinimo ? <Badge tone="warn">Mín. {qty(p.stockMinimo)}</Badge> : <span className="muted">Mín. {qty(p.stockMinimo)}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
