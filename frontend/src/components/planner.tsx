import { useQuery } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { EstadoOrden, UnidadFrecuencia } from '../api/types';

export interface MarcaOrden { ordenId: string; codigo: string; estado: EstadoOrden }
export interface FilaPlaneador {
  clave: string; equipo: string; cantidad: number; frecuencia: { valor: number; unidad: UnidadFrecuencia }; frecuenciaTexto: string; plan: string; actividad: string;
  semanas: Record<number, { p: number; proyectadas: number; e: number }>;
  programadasAnio: number; programadasCorte: number; ejecutadasCorte: number; ejecutadasAnio: number; cumplimiento: number | null;
  estado: 'SIN_ACTIVIDADES' | 'CUMPLIDAS' | 'PENDIENTES';
  observaciones: string[];
  maquinas: Array<{ id: string; codigo: string; nombre: string; planId: string; vigente: boolean; semanas: Record<number, { p: MarcaOrden[]; proyectada: boolean; e: MarcaOrden[] }> }>;
}
export interface Planeador {
  area: string; anio: number; corte: number; meta: number;
  semanas: Array<{ n: number; mes: number; lunes: string }>;
  resumen: { corte: number; programadasCorte: number; ejecutadasCorte: number; programadasAnio: number; ejecutadasAnio: number; cumplimiento: number | null };
  filas: FilaPlaneador[];
}

export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
export const ESTADO_CORTE: Record<FilaPlaneador['estado'], string> = {
  CUMPLIDAS: 'Cumplidas al corte', PENDIENTES: 'Pendientes', SIN_ACTIVIDADES: 'Sin actividades al corte',
};

export function usePlaneador(area: string, anio: number, corte?: number | null) {
  return useQuery({
    queryKey: ['planeador', area, anio, corte ?? null],
    queryFn: () => api.get<Planeador>(`/planeador?area=${encodeURIComponent(area)}&anio=${anio}${corte !== undefined && corte !== null ? `&corte=${corte}` : ''}`),
    enabled: !!area,
  });
}

export const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`);

/** Meses con las semanas que les tocan (por su jueves), para el encabezado de la cuadrícula. */
function meses(semanas: Planeador['semanas']) {
  const out: Array<{ mes: number; n: number }> = [];
  for (const s of semanas) {
    const u = out[out.length - 1];
    if (u && u.mes === s.mes) u.n++;
    else out.push({ mes: s.mes, n: 1 });
  }
  return out;
}

/**
 * Cuadrícula del planeador (AC-PMT-CR01): por cada fila, un renglón de programadas y otro de ejecutadas en las
 * semanas del año. En pantalla una fila se abre para ver cada máquina; impresa va compacta.
 */
export function PlaneadorGrid({ d, impreso }: { d: Planeador; impreso?: boolean }) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const caja = useRef<HTMLDivElement>(null);
  // En pantalla, la cuadrícula arranca mostrando la semana de corte (y unas semanas antes), no enero.
  useEffect(() => {
    const c = caja.current;
    if (impreso || !c) return;
    const th = c.querySelector<HTMLElement>(`thead tr:nth-child(2) th:nth-child(${Math.max(1, d.corte - 6)})`);
    const fija = c.querySelector<HTMLElement>('thead .pl-eq');
    if (th) c.scrollLeft = Math.max(0, th.offsetLeft - (fija?.offsetWidth ?? 0) - 8);
  }, [d.corte, d.anio, d.area, impreso]);
  const alternar = (k: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const clase = (w: number) => `pl-w ${w === d.corte ? 'pl-corte' : ''} ${w > d.corte ? 'pl-futuro' : ''}`;
  const celdaFila = (s: { p: number; proyectadas: number; e: number } | undefined, k: 'p' | 'e') => {
    if (!s) return null;
    if (k === 'e') return s.e ? <span className="pl-e">{s.e}</span> : null;
    if (s.p) return <span className="pl-p">{s.p + s.proyectadas}</span>;
    return s.proyectadas ? <span className="pl-proy" title="Proyectada por el plan">{s.proyectadas}</span> : null;
  };
  return (
    <div ref={caja} className={`pl-wrap ${impreso ? 'pl-impreso' : ''}`}>
      <table className="pl">
        <thead>
          <tr>
            <th rowSpan={2} className="pl-eq">Equipo</th>
            <th rowSpan={2}>Cant.</th>
            <th rowSpan={2}>Frecuencia</th>
            <th rowSpan={2} className="pl-act">Actividad</th>
            <th rowSpan={2}>Tipo</th>
            {meses(d.semanas).map((m, i) => <th key={i} colSpan={m.n} className="pl-mes" title={MESES[m.mes - 1]}>{impreso || m.n < 4 ? MESES[m.mes - 1].slice(0, 3) : MESES[m.mes - 1]}</th>)}
            <th rowSpan={2}>Cumpl. al corte</th>
            <th rowSpan={2}>Estado al corte</th>
            <th rowSpan={2} className="pl-obs">Observación</th>
          </tr>
          <tr>{d.semanas.map((s) => <th key={s.n} className={clase(s.n)} title={`Semana ${s.n} · desde el ${s.lunes.split('-').reverse().join('/')}`}>{s.n}</th>)}</tr>
        </thead>
        <tbody>
          {d.filas.map((f) => {
            const abierta = !impreso && abiertas.has(f.clave);
            return (
              <Fragment key={f.clave}>
                <tr className="pl-prog">
                  <th rowSpan={2} className="pl-eq" scope="rowgroup">
                    {impreso ? f.equipo : (
                      <button type="button" className="link-btn pl-toggle" aria-expanded={abierta} onClick={() => alternar(f.clave)}>
                        <span aria-hidden>{abierta ? '▾' : '▸'}</span> {f.equipo}
                      </button>
                    )}
                    <div className="pl-plan">{f.plan}</div>
                  </th>
                  <td rowSpan={2} className="pl-num">{f.cantidad}</td>
                  <td rowSpan={2}>{f.frecuenciaTexto}</td>
                  <td rowSpan={2} className="pl-act"><div className="pl-act-txt" title={f.actividad}>{f.actividad}</div></td>
                  <td className="pl-tipo">Programadas · {f.programadasAnio}</td>
                  {d.semanas.map((s) => <td key={s.n} className={clase(s.n)}>{celdaFila(f.semanas[s.n], 'p')}</td>)}
                  <td rowSpan={2} className={`pl-num ${f.cumplimiento !== null && f.cumplimiento < d.meta ? 'pl-bajo' : ''}`}>{pct(f.cumplimiento)}</td>
                  <td rowSpan={2} className={`pl-estado pl-${f.estado.toLowerCase()}`}>{ESTADO_CORTE[f.estado]}</td>
                  <td rowSpan={2} className="pl-obs">{f.observaciones.length ? <ul>{f.observaciones.map((o) => <li key={o}>{o}</li>)}</ul> : null}</td>
                </tr>
                <tr className="pl-ejec">
                  <td className="pl-tipo">Ejecutadas · {f.ejecutadasAnio}</td>
                  {d.semanas.map((s) => <td key={s.n} className={clase(s.n)}>{celdaFila(f.semanas[s.n], 'e')}</td>)}
                </tr>
                {abierta ? f.maquinas.map((m) => (
                  <Fragment key={m.id + m.planId}>
                    <tr className="pl-maq pl-prog">
                      <th rowSpan={2} className="pl-eq pl-maq-nombre" scope="rowgroup">
                        <Link to={`/maquinas/${m.id}`}>{m.codigo}</Link>
                        <div className="pl-plan">{m.nombre}{m.vigente ? '' : ' · plan inactivo'}</div>
                      </th>
                      <td colSpan={3} rowSpan={2} />
                      <td className="pl-tipo">Programada</td>
                      {d.semanas.map((s) => {
                        const c = m.semanas[s.n];
                        return (
                          <td key={s.n} className={clase(s.n)}>
                            {c?.p.length ? c.p.map((o) => <Link key={o.ordenId} to={`/ordenes/${o.ordenId}`} className="pl-p" title={`${o.codigo}`}>1</Link>)
                              : c?.proyectada ? <span className="pl-proy" title="Proyectada por el plan">1</span> : null}
                          </td>
                        );
                      })}
                      <td colSpan={3} rowSpan={2} />
                    </tr>
                    <tr className="pl-maq pl-ejec">
                      <td className="pl-tipo">Ejecutada</td>
                      {d.semanas.map((s) => {
                        const c = m.semanas[s.n];
                        return <td key={s.n} className={clase(s.n)}>{c?.e.map((o) => <Link key={o.ordenId} to={`/ordenes/${o.ordenId}`} className="pl-e" title={o.codigo}>1</Link>)}</td>;
                      })}
                    </tr>
                  </Fragment>
                )) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
