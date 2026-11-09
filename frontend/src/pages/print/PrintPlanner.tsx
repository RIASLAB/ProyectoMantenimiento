import { useSearchParams } from 'react-router-dom';
import { PlaneadorGrid, pct, usePlaneador } from '../../components/planner';
import { FormatHeader, PieSistema, PrintPage, useFormatos } from '../../components/print';
import { date } from '../../format';

/** Planeador anual impreso, con el encabezado del formato AC-PMT-CR01 (D-36). */
export function PrintPlanner() {
  const [sp] = useSearchParams();
  const area = sp.get('area') ?? '';
  const anio = Number(sp.get('anio')) || new Date().getFullYear();
  const corte = sp.get('corte') ? Number(sp.get('corte')) : null;
  const q = usePlaneador(area, anio, corte);
  const formatos = useFormatos();
  const d = q.data;
  const total = d?.semanas.length ?? 52;
  return (
    <PrintPage titulo={`Planeador de mantenimiento ${anio} · ${area}`} loading={q.isPending} error={q.error} horizontal>
      {d ? (
        <>
          <FormatHeader titulo={`PLANEADOR DE MANTENIMIENTO ${anio} · ${area.toUpperCase()}`} formato={formatos.data?.PLANEADOR} />
          <table className="pl-cab">
            <tbody>
              <tr>
                <td><strong>Fecha actual:</strong> {date(new Date().toISOString())}</td>
                <td><strong>Tema:</strong> Actividades de mantenimiento preventivo</td>
                <td><strong>Responsable del seguimiento:</strong> Líder de mantenimiento</td>
                <td><strong>Meta:</strong> {pct(d.meta)}</td>
              </tr>
              <tr>
                <td><strong>Semana de corte:</strong> {d.corte} · {pct(Math.round((d.corte / total) * 1000) / 10)} del año</td>
                <td><strong>Programadas al corte:</strong> {d.resumen.programadasCorte} ({d.resumen.programadasAnio} en el año)</td>
                <td><strong>Ejecutadas al corte:</strong> {d.resumen.ejecutadasCorte}</td>
                <td><strong>Cumplimiento:</strong> {pct(d.resumen.cumplimiento)}</td>
              </tr>
            </tbody>
          </table>
          <PlaneadorGrid d={d} impreso />
          <p className="ppie">Programadas: órdenes preventivas en su semana (las de semanas futuras, proyectadas por cada plan). Ejecutadas: órdenes cerradas, en la semana en que se hicieron.</p>
          <PieSistema />
        </>
      ) : null}
    </PrintPage>
  );
}
