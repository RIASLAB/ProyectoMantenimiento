import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api/client';
import type { PlanillaTemperaturas } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { FirmaCasilla, FormatHeader, PieSistema, PrintPage } from '../../components/print';
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import { dateTime, qty, rangoTexto } from '../../format';
import { useUrlFilters } from '../../hooks';

const FRANJAS = [0, 3, 6, 9, 12, 15, 18, 21];
const POR_TABLA = 10;
const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

/** Rangos de los formatos de la planta (se imprimen igual que en el papel). */
const PARAMETROS = [
  'Túnel de congelación: −24 a −18 °C',
  'Friss y contenedores: −18 a −10 °C',
  'Cuartos de refrigeración: −4 a 4 °C',
  'Cuartos de canales: −5 a 4 °C',
  'Subproductos y devoluciones: −2 a 6 °C',
];

/** Una planilla diaria (también la usa el paquete mensual). */
export function HojaTemperaturas({ p, fecha, claveFirma }: { p: PlanillaTemperaturas; fecha: string; claveFirma: string }) {
  // Última lectura de cada punto en cada franja.
  const celda = new Map<string, PlanillaTemperaturas['lecturas'][number]>();
  for (const l of p.lecturas) celda.set(`${l.puntoId}:${l.franja}`, l);
  const grupos: Array<PlanillaTemperaturas['puntos']> = [];
  for (let i = 0; i < p.puntos.length; i += POR_TABLA) grupos.push(p.puntos.slice(i, i + POR_TABLA));
  const desviaciones = p.lecturas.filter((l) => l.fueraDeRango || l.accionCorrectiva);
  const nombrePunto = (id: string) => p.puntos.find((x) => x.id === id)?.activo.nombre ?? '';
  return (
    <>
          <FormatHeader titulo={`Nutrialimentos Cárnicos S.A.S. · Registro de temperatura de cuartos fríos y áreas · ${p.area}`} formato={p.formato} />
          <p><span className="plabel">FECHA:</span> {fecha.split('-').reverse().join('/')}</p>
          {grupos.map((g, gi) => (
            <Fragment key={gi}>
              <table style={{ marginTop: gi ? 6 : 0 }}>
                <thead>
                  <tr><th rowSpan={2} className="c" style={{ width: 52 }}>HORA</th><th colSpan={g.length} className="c">CUARTOS FRÍOS</th></tr>
                  <tr>{g.map((x) => <th key={x.id} className="c" style={{ fontSize: '7.5pt' }}>{x.activo.nombre.toUpperCase()} (°C)<div style={{ fontWeight: 400 }}>{x.minimo !== null || x.maximo !== null ? rangoTexto(x.minimo, x.maximo) : ''}</div></th>)}</tr>
                </thead>
                <tbody>
                  {FRANJAS.map((h) => (
                    <tr key={h}>
                      <td className="c">{String(h).padStart(2, '0')}:00</td>
                      {g.map((x) => {
                        const l = celda.get(`${x.id}:${h}`);
                        return <td key={x.id} className={`c ${l?.fueraDeRango ? 'pfuera' : ''}`} title={l ? `${l.hora} · ${l.usuario}` : undefined}>{l ? qty(l.valor) : ''}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Fragment>
          ))}
          <div className="pgap" />
          <table>
            <tbody>
              <tr><th>OBSERVACIONES</th></tr>
              <tr>
                <td className="ptxt" style={{ minHeight: 36 }}>
                  {[...desviaciones.map((l) => `${l.hora} ${nombrePunto(l.puntoId)}: ${qty(l.valor)} °C${l.fueraDeRango ? ' (fuera de rango)' : ''}${l.accionCorrectiva ? ` — ${l.accionCorrectiva}` : ''}`),
                    p.verificacion?.observaciones ? `Verificación: ${p.verificacion.observaciones}` : null].filter(Boolean).join('\n')}
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: '8pt' }}>* Fuera del rango permitido. Si en una franja hay varias lecturas se muestra la última.</p>
          <div className="pfirmas dos">
            <FirmaCasilla entidad="PLANILLA" entidadId={claveFirma} casilla="REALIZO" cargo="Realizó" nombre={p.realizadoPor.join(', ') || null} />
            <FirmaCasilla entidad="PLANILLA" entidadId={claveFirma} casilla="VERIFICO" cargo="Verificó" soloJefe
              nombre={p.verificacion ? `${p.verificacion.usuario} · ${dateTime(p.verificacion.creadoEn)}` : null} />
          </div>
          <h3>Parámetros de temperatura</h3>
          <p style={{ fontSize: '8.5pt' }}>{PARAMETROS.join(' · ')}</p>
          <PieSistema />
    </>
  );
}

/**
 * Planilla diaria de temperaturas de una planta (AC-PMT-FR01/FR02): una fila por franja de 3 horas y una columna por cuarto,
 * con quién registró (Realizó) y la verificación del jefe (Verificó).
 */
export function PrintTemperatures() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [f, set] = useUrlFilters(['area', 'fecha'] as const);
  const fecha = f.fecha || hoyLocal();
  const [verificar, setVerificar] = useState(false);
  const [obs, setObs] = useState('');
  const areas = useQuery({ queryKey: ['calidad', 'planilla', 'areas'], queryFn: () => api.get<string[]>('/calidad/planilla/areas') });
  const area = f.area || areas.data?.[0] || '';
  const q = useQuery({
    queryKey: ['calidad', 'planilla', area, fecha],
    queryFn: () => api.get<PlanillaTemperaturas>(`/calidad/planilla${qs({ area, fecha })}`),
    enabled: !!area,
  });
  const v = useMutation({
    mutationFn: () => api.post('/calidad/planilla/verificar', { fecha, area, observaciones: obs || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calidad', 'planilla'] }); setVerificar(false); setObs(''); },
  });
  const p = q.data;
  // La firma de la planilla se guarda con el área tal como está registrada.
  const claveFirma = p ? `${fecha}|${areas.data?.find((x) => x.toLowerCase() === p.area.toLowerCase()) ?? p.area}` : '';
  const desviaciones = (p?.lecturas ?? []).filter((l) => l.fueraDeRango || l.accionCorrectiva);

  const controles = (
    <>
      <Select value={area} onChange={(e) => set('area', e.target.value)} aria-label="Planta o área">
        {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
      </Select>
      <Input type="date" value={fecha} max={hoyLocal()} onChange={(e) => set('fecha', e.target.value)} aria-label="Fecha" />
      <Link className="btn btn-ghost" to={`/calidad/ronda?area=${encodeURIComponent(area)}`}>Registrar ronda</Link>
      {can('ADMIN', 'AUTORIZADOR') && p && !p.verificacion && p.lecturas.length ? <Button variant="secondary" onClick={() => setVerificar(true)}>Verificar planilla</Button> : null}
    </>
  );

  return (
    <PrintPage titulo={`Temperaturas ${area} ${fecha}`} controles={controles} horizontal loading={areas.isPending || (!!area && q.isPending)} error={areas.error ?? q.error}>
      {!area ? <p>No hay puntos de control de temperatura configurados.</p> : p ? (
        <>
          <HojaTemperaturas p={p} fecha={fecha} claveFirma={claveFirma} />
        </>
      ) : null}
      <Modal open={verificar} title="Verificar planilla" onClose={() => setVerificar(false)}
        footer={<><Button variant="ghost" onClick={() => setVerificar(false)}>Cancelar</Button><Button busy={v.isPending} onClick={() => v.mutate()}>Verificar</Button></>}>
        <div className="stack">
          <p style={{ margin: 0 }}>{area} · {fecha.split('-').reverse().join('/')} · {p?.lecturas.length ?? 0} lecturas{desviaciones.length ? `, ${desviaciones.filter((d) => d.fueraDeRango).length} fuera de rango` : ''}.</p>
          <Field label="Observaciones">{(i) => <Textarea id={i} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} />}</Field>
          <p className="muted small" style={{ margin: 0 }}>La verificación queda con su nombre y la hora, y no se puede deshacer.</p>
          {v.isError ? <ErrorBox error={v.error} /> : null}
        </div>
      </Modal>
    </PrintPage>
  );
}
