import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, openProtectedFile, qs } from '../../api/client';
import type { EquipmentModel, ResumenEquipos } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, Empty, ErrorBox, Field, Icon, PageHeader, Select, Spinner } from '../../components/ui';
import { useUrlFilters } from '../../hooks';
import { AssetsTabs } from './AssetsList';

/** Cuántos equipos hay de cada tipo en cada área (ej. cuántos aires acondicionados hay en Bodega). */
export function EquipmentSummary() {
  const { can } = useAuth();
  const [f, set] = useUrlFilters(['area', 'categoriaId', 'modeloId'] as const);
  const [errorExportar, setErrorExportar] = useState('');
  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<string[]>('/activos/areas') });
  const tipos = useQuery({ queryKey: ['tipos-equipo'], queryFn: () => api.get<EquipmentModel[]>('/tipos-equipo') });
  const q = useQuery({
    queryKey: ['tipos-equipo', 'resumen', f.area, f.categoriaId, f.modeloId],
    queryFn: () => api.get<ResumenEquipos>(`/tipos-equipo/resumen${qs({ area: f.area, categoriaId: f.categoriaId, modeloId: f.modeloId })}`),
  });
  const categorias = [...new Map((tipos.data ?? []).map((t) => [t.categoria.id, t.categoria.nombre])).entries()];
  const modelos = (tipos.data ?? []).filter((t) => !f.categoriaId || t.categoria.id === f.categoriaId);
  const que = f.modeloId ? tipos.data?.find((t) => t.id === f.modeloId)?.nombre
    : f.categoriaId ? categorias.find(([id]) => id === f.categoriaId)?.[1] : 'equipos';
  const donde = f.area ? `en ${f.area}` : 'en total';
  const r = q.data;
  const bajas = r ? r.total - r.enUso : 0;

  return (
    <>
      <PageHeader title="Máquinas" subtitle="Cuántos equipos hay de cada tipo en cada área" />
      <AssetsTabs />
      <div className="toolbar period">
        <Field label="Área">
          {(i) => (
            <Select id={i} value={f.area} onChange={(e) => set('area', e.target.value)}>
              <option value="">Todas las áreas</option>
              {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Categoría">
          {(i) => (
            <Select id={i} value={f.categoriaId} onChange={(e) => { set('categoriaId', e.target.value); set('modeloId', ''); }}>
              <option value="">Todas</option>
              {categorias.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Modelo">
          {(i) => (
            <Select id={i} value={f.modeloId} onChange={(e) => set('modeloId', e.target.value)}>
              <option value="">Todos</option>
              {modelos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !r || r.total === 0 ? (
        <Empty title="No hay equipos con estos filtros" />
      ) : (
        <div className="stack">
          <section className="card respuesta" aria-live="polite">
            <span className="respuesta-n">{r.enUso}</span>
            <div>
              <strong>{que} {donde}</strong>
              <span className="muted">{bajas ? `en uso · además ${bajas} dado${bajas === 1 ? '' : 's'} de baja` : 'en uso'}</span>
            </div>
            <Link className="btn btn-ghost" to={`/maquinas${qs({ area: f.area, categoriaId: f.categoriaId, modeloId: f.modeloId })}`}>Ver la lista</Link>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Detalle</h2>
              {can('ADMIN', 'AUTORIZADOR') ? (
                <Button variant="secondary" onClick={() => { setErrorExportar(''); openProtectedFile(`/tipos-equipo/resumen/exportar${qs({ area: f.area, categoriaId: f.categoriaId, modeloId: f.modeloId })}`, 'equipos-por-area.csv', true).catch((e) => setErrorExportar(e.message)); }}>
                  <Icon name="download" /> Exportar
                </Button>
              ) : null}
            </div>
            {errorExportar ? <div className="alert alert-bad">{errorExportar}</div> : null}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Tipo</th><th>Área</th><th className="num">En uso</th><th className="num">Operativos</th><th className="num">En mant.</th><th className="num">Fuera de servicio</th><th className="num">De baja</th></tr>
                </thead>
                <tbody>
                  {r.filas.map((x, i) => (
                    <tr key={i}>
                      <td data-label="Tipo">
                        <Link to={`/maquinas${qs({ area: x.area, modeloId: x.modeloId ?? undefined })}`}><strong>{x.categoria}</strong>{x.modelo ? ` · ${x.modelo}` : ''}</Link>
                      </td>
                      <td data-label="Área">{x.area}</td>
                      <td data-label="En uso" className="num"><strong>{x.total - x.dadosDeBaja}</strong></td>
                      <td data-label="Operativos" className="num">{x.operativos}</td>
                      <td data-label="En mant." className="num">{x.enMantenimiento}</td>
                      <td data-label="Fuera de servicio" className={`num ${x.fueraDeServicio ? 'text-bad' : ''}`}>{x.fueraDeServicio}</td>
                      <td data-label="De baja" className="num">{x.dadosDeBaja}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
