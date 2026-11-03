import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { LightingSurveyDetail } from '../../api/types';
import { Firma, FormatHeader, Marca, PieSistema, PrintPage } from '../../components/print';
import { date, qty } from '../../format';

/** Medición de iluminación en el formato AC-PMT-MI01, con el resumen de límites permisibles. */
export function PrintLighting() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['iluminacion', 'medicion', id], queryFn: () => api.get<LightingSurveyDetail>(`/iluminacion/mediciones/${id}`) });
  const m = q.data;
  const tipos = new Map<string, { ref: string; total: number; cumplen: number }>();
  for (const l of m?.lecturas ?? []) {
    const t = tipos.get(l.recintoNombre) ?? { ref: `${l.refMinimo} - ${l.refPromedio} - ${l.refMaximo}`, total: 0, cumplen: 0 };
    t.total += 1;
    if (l.cumple) t.cumplen += 1;
    tipos.set(l.recintoNombre, t);
  }
  const total = m?.lecturas.length ?? 0;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');
  const esPlanta = (m?.lugar ?? '').trim().toLowerCase() === 'planta';

  return (
    <PrintPage titulo={m ? `Iluminación ${m.fecha} ${m.lugar}` : 'Medición de iluminación'} horizontal loading={q.isPending} error={q.error}>
      {m ? (
        <>
          <FormatHeader titulo="Formato de registro de medición de iluminación" formato={m.formato} />
          <table>
            <tbody>
              <tr>
                <td><span className="plabel">FECHA DE MEDICIÓN:</span> {date(m.fecha)}</td>
                <td colSpan={2}><span className="plabel">EMPRESA:</span> NUTRIALIMENTOS <Marca on={m.empresa === 'NUTRIALIMENTOS'} /> INDUCARNES <Marca on={m.empresa === 'INDUCARNES'} /></td>
              </tr>
              <tr><td colSpan={3}><span className="plabel">LUGAR:</span> PLANTA <Marca on={esPlanta} /> PUNTO DE VENTA: {esPlanta ? '' : m.lugar}</td></tr>
              <tr>
                <td><span className="plabel">NOMBRE DEL EVALUADOR:</span> {m.evaluador}</td>
                <td colSpan={2}><span className="plabel">CARGO DEL EVALUADOR:</span> {m.cargoEvaluador}</td>
              </tr>
            </tbody>
          </table>
          <div className="pgap" />
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 28 }}>N.º</th><th>PUNTO EVALUADO</th><th>TIPO DE RECINTO / ACTIVIDAD</th>
                <th className="c">MEDICIÓN 1</th><th className="c">MEDICIÓN 2</th><th className="c">MEDICIÓN 3</th><th className="c">MEDIA</th>
                <th>PLAN DE ACCIÓN</th><th>OBSERVACIONES</th>
              </tr>
            </thead>
            <tbody>
              {m.lecturas.map((l, i) => (
                <tr key={l.id}>
                  <td className="c">{i + 1}</td><td>{l.puntoNombre}</td><td style={{ fontSize: '8pt' }}>{l.recintoNombre}</td>
                  <td className="c">{qty(l.medicion1)}</td><td className="c">{qty(l.medicion2)}</td><td className="c">{qty(l.medicion3)}</td>
                  <td className={`c ${l.cumple ? '' : 'nc-cell'}`}>{qty(l.media)}</td>
                  <td>{l.planAccion ?? ''}</td><td>{l.observaciones ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '8.5pt' }}>Nota: la medición realizada es diurna. Valores en lux.</p>
          <table style={{ width: '75%' }}>
            <thead>
              <tr><th colSpan={5} className="c">LÍMITES PERMISIBLES</th></tr>
              <tr><th>Tipo de recinto / actividad</th><th className="c">Valor de referencia mín. - prom. - máx.</th><th className="c">N.º de mediciones</th><th className="c">Cumplen</th><th className="c">Porcentaje</th></tr>
            </thead>
            <tbody>
              {[...tipos].map(([nombre, t]) => (
                <tr key={nombre}><td>{nombre}</td><td className="c">{t.ref}</td><td className="c">{t.total}</td><td className="c">{t.cumplen}</td><td className="c">{pct(t.cumplen, t.total)}</td></tr>
              ))}
              <tr><th colSpan={2} className="r">TOTAL</th><th className="c">{total}</th><th className="c">{m.puntosCumplen}</th><th className="c">{pct(m.puntosCumplen, total)}</th></tr>
            </tbody>
          </table>
          {m.observaciones ? <p><strong>Observaciones:</strong> {m.observaciones}</p> : null}
          <div className="pfirmas dos">
            <Firma cargo="Evaluador" nombre={m.evaluador} />
            <Firma cargo="Revisó" />
          </div>
          <p className="ppie">Registró: {m.usuario.nombre}</p>
          <PieSistema />
        </>
      ) : null}
    </PrintPage>
  );
}
