import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PlaneadorGrid, pct, usePlaneador } from '../../components/planner';
import { Empty, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { useUrlFilters } from '../../hooks';
import { OrdersTabs } from './OrdersList';

/**
 * Planeador anual de mantenimiento por planta (AC-PMT-CR01, D-36): lo mismo que el Excel de la planta, pero
 * sin llenarlo. Programadas = órdenes preventivas (y lo que proyecta cada plan); ejecutadas = órdenes cerradas.
 */
export function Planner() {
  const [f, set] = useUrlFilters(['area', 'anio', 'corte'] as const);
  const areas = useQuery({ queryKey: ['planeador', 'areas'], queryFn: () => api.get<string[]>('/planeador/areas') });
  useEffect(() => {
    if (!f.area && areas.data?.length) set('area', areas.data[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas.data, f.area]);
  const anio = Number(f.anio) || new Date().getFullYear();
  const q = usePlaneador(f.area, anio, f.corte ? Number(f.corte) : null);
  const d = q.data;
  const total = d?.semanas.length ?? 52;
  const r = d?.resumen;
  const params = new URLSearchParams({ area: f.area, anio: String(anio), ...(d ? { corte: String(d.corte) } : {}) });

  return (
    <>
      <PageHeader title="Mantenimiento"
        actions={d ? <Link to={`/imprimir/planeador?${params}`} className="btn btn-secondary"><Icon name="download" /> Imprimir / PDF</Link> : null} />
      <OrdersTabs />
      <div className="pl-filtros">
        <Field label="Planta o área">
          {(i) => (
            <Select id={i} value={f.area} onChange={(e) => set('area', e.target.value)} disabled={!areas.data?.length}>
              {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Año">
          {(i) => (
            <Select id={i} value={String(anio)} onChange={(e) => { set('anio', e.target.value); set('corte', ''); }}>
              {[anio - 2, anio - 1, anio, anio + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Semana de corte">
          {(i) => <Input id={i} type="number" min={0} max={total} value={f.corte || (d ? String(d.corte) : '')} onChange={(e) => set('corte', e.target.value)} style={{ width: 110 }} />}
        </Field>
      </div>

      {areas.isError ? <ErrorBox error={areas.error} /> : areas.data && !areas.data.length ? (
        <Empty title="Aún no hay planes preventivos">Cree los planes de las máquinas (o cargue sus hojas de vida) y aquí aparece el planeador de cada planta.</Empty>
      ) : q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
        <>
          <div className="kpis pl-kpis">
            <div className="kpi"><span className="kpi-title">Programadas al corte</span><strong className="kpi-value">{r!.programadasCorte}</strong><span className="kpi-detail">{r!.programadasAnio} en el año</span></div>
            <div className="kpi"><span className="kpi-title">Ejecutadas al corte</span><strong className="kpi-value">{r!.ejecutadasCorte}</strong><span className="kpi-detail">{r!.ejecutadasAnio} en el año</span></div>
            <div className={`kpi ${r!.cumplimiento !== null && r!.cumplimiento < d.meta ? 'kpi-bad' : 'kpi-ok'}`}>
              <span className="kpi-title">Cumplimiento</span><strong className="kpi-value">{pct(r!.cumplimiento)}</strong><span className="kpi-detail">Meta {pct(d.meta)}</span>
            </div>
            <div className="kpi"><span className="kpi-title">Semana de corte</span><strong className="kpi-value">{d.corte}</strong><span className="kpi-detail">{pct(Math.round((d.corte / total) * 1000) / 10)} del año</span></div>
          </div>
          <p className="muted small pl-leyenda">
            <span className="pl-p">1</span> programada · <span className="pl-proy">1</span> proyectada por el plan · <span className="pl-e">1</span> ejecutada (en la semana en que se hizo).
            Toque un equipo para ver cada máquina y abrir sus órdenes.
          </p>
          {d.filas.length ? <PlaneadorGrid d={d} /> : <Empty title="Sin planes en esta planta" />}
        </>
      ) : null}
    </>
  );
}
