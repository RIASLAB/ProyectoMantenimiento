import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/client';
import type { KpiMachine, KpiReport } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Empty, ErrorBox, Field, Icon, Input, PageHeader, Spinner } from '../components/ui';
import { date, money } from '../format';
import { useUrlFilters } from '../hooks';

const n1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const n2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
/** Horas; menos de una hora se muestra en minutos. */
const h = (v: number | null) => (v === null ? '—' : v > 0 && v < 1 ? `${Math.round(v * 60)} min` : `${n1.format(v)} h`);
const p = (v: number | null) => (v === null ? '—' : `${n1.format(v)} %`);

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function presets() {
  const hoy = new Date();
  const menos = (dias: number) => iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias));
  return [
    { id: '30', label: 'Últimos 30 días', desde: menos(29), hasta: iso(hoy) },
    { id: 'mes', label: 'Este mes', desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) },
    { id: 'anterior', label: 'Mes anterior', desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) },
    { id: '90', label: 'Últimos 90 días', desde: menos(89), hasta: iso(hoy) },
    { id: 'anio', label: 'Este año', desde: iso(new Date(hoy.getFullYear(), 0, 1)), hasta: iso(hoy) },
  ];
}

type Tono = 'ok' | 'bad' | null;
/** Compara con la meta (KPI-07). En MTTR menos es mejor. */
function frenteMeta(valor: number | null, meta: number | null, menosEsMejor = false): Tono {
  if (valor === null || meta === null) return null;
  return (menosEsMejor ? valor <= meta : valor >= meta) ? 'ok' : 'bad';
}

function Kpi({ titulo, valor, detalle, meta, tono, ayuda }: { titulo: string; valor: string; detalle: string; meta?: string | null; tono?: Tono; ayuda: string }) {
  return (
    <section className={`kpi ${tono === 'bad' ? 'kpi-bad' : ''}`} aria-label={titulo} title={ayuda}>
      <span className="kpi-title">{titulo}</span>
      <strong className="kpi-value">{valor}</strong>
      <span className="kpi-detail">{detalle}</span>
      {meta ? (
        <span className={`kpi-meta ${tono ?? ''}`}>
          {tono ? <Icon name={tono === 'ok' ? 'check' : 'alert'} size={14} /> : null}
          {tono === 'ok' ? 'Cumple la meta' : tono === 'bad' ? 'No cumple la meta' : 'Meta'} ({meta})
        </span>
      ) : null}
    </section>
  );
}

/** Barras horizontales de una sola serie: cantidad de fallas por máquina (KPI-06). */
function BarrasFallas({ maquinas }: { maquinas: KpiMachine[] }) {
  const top = maquinas.filter((m) => m.fallas > 0).slice(0, 5);
  if (!top.length) return <p className="muted" style={{ margin: 0 }}>No se reportaron fallas en el período.</p>;
  const max = Math.max(...top.map((m) => m.fallas));
  return (
    <ol className="hbars" aria-label="Máquinas con más fallas">
      {top.map((m) => (
        <li key={m.id} title={`${m.codigo} · ${m.nombre}: ${m.fallas} falla${m.fallas === 1 ? '' : 's'}, ${h(m.horasParada)} de parada`}>
          <Link to={`/maquinas/${m.id}`} className="hbar-label"><strong>{m.codigo}</strong> <span className="muted">{m.nombre}</span></Link>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(m.fallas / max) * 100}%` }} />
            <span className="hbar-value">{m.fallas}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** KPI-01 a KPI-06 para Dirección y el administrador. */
export function Indicators() {
  const { can } = useAuth();
  const opciones = presets();
  const [f, set] = useUrlFilters(['desde', 'hasta'] as const);
  const desde = f.desde || opciones[0].desde;
  const hasta = f.hasta || opciones[0].hasta;
  const activo = opciones.find((o) => o.desde === desde && o.hasta === hasta)?.id;

  const q = useQuery({
    queryKey: ['indicadores', desde, hasta],
    queryFn: () => api.get<KpiReport>(`/indicadores${qs({ desde, hasta })}`),
    enabled: desde <= hasta,
  });
  const elegir = (d: string, ha: string) => { set('desde', d); set('hasta', ha); };

  return (
    <>
      <PageHeader title="Indicadores" subtitle={`Del ${date(desde)} al ${date(hasta)}`} />
      <div className="chips" role="group" aria-label="Período">
        {opciones.map((o) => (
          <button key={o.id} type="button" className={`chip ${activo === o.id ? 'chip-on' : ''}`} aria-pressed={activo === o.id} onClick={() => elegir(o.desde, o.hasta)}>{o.label}</button>
        ))}
      </div>
      <div className="toolbar period">
        <Field label="Desde">{(i) => <Input id={i} type="date" value={desde} max={hasta} onChange={(e) => e.target.value && set('desde', e.target.value)} />}</Field>
        <Field label="Hasta">{(i) => <Input id={i} type="date" value={hasta} min={desde} onChange={(e) => e.target.value && set('hasta', e.target.value)} />}</Field>
      </div>

      {desde > hasta ? <div className="alert alert-warn">La fecha inicial es posterior a la final.</div>
        : q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <Reporte r={q.data} admin={can('ADMIN')} />}
    </>
  );
}

function Reporte({ r, admin }: { r: KpiReport; admin: boolean }) {
  const g = r.global;
  const m = r.metas;
  const pv = g.preventivos;
  if (g.maquinas === 0) {
    return <Empty title="No hay máquinas registradas en este período"><p className="muted">Los indicadores se calculan a partir de las máquinas y sus órdenes de trabajo.</p></Empty>;
  }
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi titulo="Disponibilidad" valor={p(g.disponibilidad)} tono={frenteMeta(g.disponibilidad, m.disponibilidad)} meta={m.disponibilidad !== null ? p(m.disponibilidad) : null}
          detalle={`${h(g.horasParada)} de parada en ${n1.format(g.horasPlanificadas)} h planificadas`}
          ayuda="(Tiempo planificado − tiempo de parada) / tiempo planificado, en el horario de producción" />
        <Kpi titulo="MTBF · tiempo medio entre fallas" valor={h(g.mtbfHoras)} tono={frenteMeta(g.mtbfHoras, m.mtbf)} meta={m.mtbf !== null ? h(m.mtbf) : null}
          detalle={g.fallas ? `${g.fallas} falla${g.fallas === 1 ? '' : 's'} reportada${g.fallas === 1 ? '' : 's'}` : 'Sin fallas en el período'}
          ayuda="Tiempo de operación / número de fallas" />
        <Kpi titulo="MTTR · tiempo medio de reparación" valor={h(g.mttrHoras)} tono={frenteMeta(g.mttrHoras, m.mttr, true)} meta={m.mttr !== null ? h(m.mttr) : null}
          detalle={g.reparaciones ? `${g.reparaciones} reparación${g.reparaciones === 1 ? '' : 'es'} cerrada${g.reparaciones === 1 ? '' : 's'}` : 'Sin reparaciones cerradas'}
          ayuda="Tiempo total de reparación / número de reparaciones" />
        <Kpi titulo="Cumplimiento de preventivos" valor={p(pv.cumplimiento)} tono={frenteMeta(pv.cumplimiento, m.cumplimiento)} meta={m.cumplimiento !== null ? p(m.cumplimiento) : null}
          detalle={`${pv.aTiempo} a tiempo · ${pv.tarde} tarde · ${pv.vencidos} vencido${pv.vencidos === 1 ? '' : 's'}`}
          ayuda="Preventivos cerrados a tiempo / preventivos programados que ya debían estar hechos" />
        <Kpi titulo="Rotación del inventario" valor={g.inventario.rotacion === null ? '—' : `${n2.format(g.inventario.rotacion)} veces`} tono={frenteMeta(g.inventario.rotacion, m.rotacion)} meta={m.rotacion !== null ? n2.format(m.rotacion) : null}
          detalle={`Consumo ${money(g.inventario.consumo)} · inventario promedio ${money(g.inventario.valorPromedio)}`}
          ayuda="Costo de los repuestos consumidos en el período / valor promedio del inventario" />
        <Kpi titulo="Valor del inventario hoy" valor={money(r.inventarioActual.valorTotal)}
          detalle={`${r.inventarioActual.bajoMinimo} repuesto${r.inventarioActual.bajoMinimo === 1 ? '' : 's'} bajo el mínimo · ${r.inventarioActual.sinStock} sin stock`}
          ayuda="Stock actual × costo promedio de cada repuesto activo" />
      </div>

      <div className="kpi-cols">
        <section className="card">
          <h2>Máquinas que más fallan</h2>
          <BarrasFallas maquinas={r.maquinas} />
        </section>
        <section className="card">
          <h2>Repuestos bajo el mínimo</h2>
          {r.inventarioActual.criticos.length === 0 ? <p className="muted" style={{ margin: 0 }}>Todos los repuestos están sobre su stock mínimo.</p> : (
            <ul className="crit-list">
              {r.inventarioActual.criticos.map((x) => (
                <li key={x.id}>
                  <Link to={`/inventario/${x.id}`}><strong>{x.codigo}</strong> <span className="muted">{x.descripcion}</span></Link>
                  <span className={`badge ${x.stock <= 0 ? 'badge-bad' : 'badge-warn'}`}>{x.stock <= 0 ? 'Sin stock' : 'Bajo mínimo'}</span>
                  <span className="crit-qty">{n2.format(x.stock)} de {n2.format(x.minimo)} {x.unidad}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Por máquina</h2>
        <div className="table-wrap">
          <table className="table kpi-table">
            <thead>
              <tr><th>Máquina</th><th className="num">Disponibilidad</th><th className="num">Parada</th><th className="num">Fallas</th><th className="num">MTBF</th><th className="num">MTTR</th></tr>
            </thead>
            <tbody>
              {r.maquinas.map((x) => (
                <tr key={x.id}>
                  <td data-label="Máquina"><Link to={`/maquinas/${x.id}`}><strong>{x.codigo}</strong></Link> <span className="muted">{x.nombre}</span></td>
                  <td data-label="Disponibilidad" className="num">
                    {p(x.disponibilidad)}
                    {frenteMeta(x.disponibilidad, m.disponibilidad) === 'bad' ? <span className="sr-only"> (bajo la meta)</span> : null}
                    {frenteMeta(x.disponibilidad, m.disponibilidad) === 'bad' ? <Icon name="alert" size={14} /> : null}
                  </td>
                  <td data-label="Parada" className="num">{h(x.horasParada)}</td>
                  <td data-label="Fallas" className="num">{x.fallas}</td>
                  <td data-label="MTBF" className="num">{h(x.mtbfHoras)}</td>
                  <td data-label="MTTR" className="num">{h(x.mttrHoras)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="card how">
        <summary>Cómo se calcula</summary>
        <ul>
          <li><strong>Tiempo planificado:</strong> {calendario(r.parametros.dias, r.parametros.horaInicio, r.parametros.horaFin)}, desde que la máquina se registró y hasta hoy.</li>
          <li><strong>Parada:</strong> desde el reporte con “máquina parada” hasta la puesta en marcha (o hasta ahora si sigue parada), solo dentro del horario de producción. Dos reportes de la misma parada no se suman dos veces y las órdenes canceladas no cuentan.</li>
          <li><strong>Fallas:</strong> órdenes correctivas reportadas en el período (con o sin parada), sin las canceladas.</li>
          <li><strong>Reparación:</strong> correctivos cerrados en el período. Con la máquina parada se mide de la parada a la puesta en marcha; sin parada, del inicio del trabajo al cierre.</li>
          <li><strong>Preventivos:</strong> los programados en el período que ya debían estar hechos. A tiempo = cerrado hasta el día programado. Los cancelados ({pv.cancelados}) y los que aún están en plazo ({pv.enPlazo}) no cuentan.</li>
          <li><strong>Inventario promedio:</strong> (valor al inicio + valor al final del período) / 2, con el costo promedio ponderado.</li>
        </ul>
        <p className="muted small" style={{ margin: 0 }}>
          Fórmulas y metas pendientes de aprobación por Dirección (D-05).
          {admin ? <> El horario y las metas se cambian en <Link to="/configuracion">Ajustes</Link>.</> : null}
        </p>
      </details>
    </div>
  );
}

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export function calendario(dias: number[], ini: string, fin: string) {
  const horario = ini === '00:00' && fin === '24:00' ? 'las 24 horas' : `de ${ini} a ${fin}`;
  const d = [...dias].sort();
  const seguidos = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const texto = d.length === 7 ? 'todos los días' : seguidos && d.length > 2 ? `de ${DIAS[d[0] - 1]} a ${DIAS[d[d.length - 1] - 1]}` : d.map((x) => DIAS[x - 1]).join(', ');
  return `${texto}, ${horario}`;
}
