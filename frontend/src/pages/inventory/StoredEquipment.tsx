import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import type { Asset } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { InstallModal } from '../../components/InstallModal';
import { Button, Empty, ErrorBox, PageHeader, Spinner } from '../../components/ui';
import { date } from '../../format';

/** Secciones de Inventario: repuestos y máquinas compradas que están en bodega sin instalar. */
export function InventoryTabs() {
  const { pathname } = useLocation();
  return (
    <nav className="tabs" aria-label="Secciones de inventario">
      <Link to="/inventario" className={`tab ${pathname === '/inventario' ? 'active' : ''}`}>Repuestos</Link>
      <Link to="/inventario/equipos" className={`tab ${pathname === '/inventario/equipos' ? 'active' : ''}`}>Equipos en bodega</Link>
    </nav>
  );
}

/** Inventario de equipos: máquinas compradas que están en bodega, agrupadas por tipo, listas para instalar. */
export function StoredEquipment() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['activos', 'en-bodega'], queryFn: () => api.get<Asset[]>('/activos?estado=EN_BODEGA') });
  const [instalar, setInstalar] = useState<Asset | null>(null);
  const [aviso, setAviso] = useState('');
  const grupos = useMemo(() => {
    const m = new Map<string, Asset[]>();
    for (const a of q.data ?? []) {
      const k = a.modeloEquipo ? `${a.modeloEquipo.categoria?.nombre} · ${a.modeloEquipo.nombre}` : 'Sin tipo de equipo';
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m];
  }, [q.data]);

  return (
    <>
      <PageHeader title="Inventario" subtitle={q.data ? `${q.data.length} equipo${q.data.length === 1 ? '' : 's'} en bodega sin instalar` : undefined} />
      <InventoryTabs />
      {aviso ? <div className="alert alert-ok">{aviso}</div> : null}
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : grupos.length === 0 ? (
        <Empty title="No hay equipos en bodega">
          <p className="muted">Al registrar máquinas compradas que aún no se instalan, márquelas como "En bodega (sin instalar)".</p>
        </Empty>
      ) : (
        <div className="stack-lg">
          {grupos.map(([tipo, equipos]) => (
            <section key={tipo}>
              <h2 className="group-title">{tipo} <span className="muted">· {equipos.length} en bodega</span></h2>
              <ul className="list">
                {equipos.map((a) => (
                  <li key={a.id} className="list-row static">
                    <div className="list-main">
                      <Link to={`/maquinas/${a.id}`} className="code">{a.codigo}</Link>
                      <strong>{a.nombre}</strong>
                      <span className="muted">
                        {[a.ubicacion, a.serie ? `Serie ${a.serie}` : null, a.fechaCompra ? `Comprado ${date(a.fechaCompra)}` : null].filter(Boolean).join(' · ') || 'Sin datos de compra'}
                      </span>
                    </div>
                    <div className="list-meta">
                      {can('ADMIN') ? <Button variant="secondary" onClick={() => { setAviso(''); setInstalar(a); }}>Instalar</Button> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <InstallModal equipo={instalar} onClose={() => setInstalar(null)}
        onDone={(r) => setAviso(`${instalar?.codigo} quedó instalado${r.planesAplicados ? ` y con ${r.planesAplicados} preventivo${r.planesAplicados === 1 ? '' : 's'} programado${r.planesAplicados === 1 ? '' : 's'}` : ''}.`)} />
    </>
  );
}
