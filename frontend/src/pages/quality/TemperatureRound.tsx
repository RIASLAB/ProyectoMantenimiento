import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uuid } from '../../api/client';
import type { ControlPointInfo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, Empty, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { hace, lecturaTexto, qty, rangoTexto } from '../../format';
import { useUrlFilters } from '../../hooks';
import { enviarOEncolar } from '../../offline/outbox';

const aNumero = (s: string | undefined) => (s === undefined || s.trim() === '' ? null : Number(s.replace(',', '.')));
const fueraDe = (p: ControlPointInfo, n: number | null) => n !== null && Number.isFinite(n) && ((p.minimo !== null && n < p.minimo) || (p.maximo !== null && n > p.maximo));

type Modo = 'DESCANSO' | 'DANADO';

/**
 * Ronda de temperaturas: el recorrido de cada 3 horas por los cuartos fríos de una planta, con todos los puntos
 * en una sola pantalla. Cada lectura se guarda como un registro (y se encola si no hay señal).
 */
export function TemperatureRound() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, set] = useUrlFilters(['area'] as const);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [acciones, setAcciones] = useState<Record<string, string>>({});
  // D-37: en lugar de la temperatura, "D" (descanso) o "F" (dañado, fuera de servicio).
  const [modos, setModos] = useState<Record<string, Modo>>({});
  const [danos, setDanos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resultado, setResultado] = useState<{ guardados: number; sinConexion: number; fuera: number; danados: number; ordenes: Array<{ id: string; codigo: string }> } | null>(null);

  const puntos = useQuery({ queryKey: ['calidad', 'puntos'], queryFn: () => api.get<ControlPointInfo[]>('/calidad/puntos') });
  const areas = useMemo(() => [...new Set((puntos.data ?? []).map((p) => p.activo.area))].sort((a, b) => a.localeCompare(b)), [puntos.data]);
  const delArea = (puntos.data ?? []).filter((p) => p.activo.area === f.area);
  const llenos = delArea.filter((p) => modos[p.id] || aNumero(valores[p.id]) !== null);
  const faltaAccion = llenos.filter((p) => !modos[p.id] && fueraDe(p, aNumero(valores[p.id])) && (acciones[p.id] ?? '').trim().length < 5);
  const faltaDano = llenos.filter((p) => modos[p.id] === 'DANADO' && (danos[p.id] ?? '').trim().length < 5);
  const alternarModo = (id: string, m: Modo) => setModos((s) => {
    const x = { ...s };
    if (x[id] === m) delete x[id]; else x[id] = m;
    return x;
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError(null);
    const registradoEn = new Date().toISOString();
    let guardados = 0; let sinConexion = 0; let fuera = 0; let danados = 0;
    const ordenes: Array<{ id: string; codigo: string }> = [];
    try {
      for (const p of llenos) {
        const modo = modos[p.id];
        const n = modo ? null : aNumero(valores[p.id])!;
        const esFuera = !modo && fueraDe(p, n);
        const r = await enviarOEncolar<{ orden?: { id: string; codigo: string } | null }>({
          usuarioId: user!.id, tipo: 'temperatura', method: 'POST', path: '/calidad/temperaturas',
          resumen: `${p.activo.codigo} · ${p.activo.nombre}: ${modo ? lecturaTexto({ valor: null, estado: modo }) : `${qty(n!)} °C`}${esFuera ? ' (fuera de rango)' : ''}`,
          body: modo
            ? { puntoId: p.id, estado: modo, observacion: modo === 'DANADO' ? danos[p.id] : undefined, clientId: uuid(), registradoEn }
            : { puntoId: p.id, valor: n, accionCorrectiva: esFuera ? acciones[p.id] : undefined, clientId: uuid(), registradoEn },
        });
        guardados += 1;
        if (r.encolado) sinConexion += 1;
        else if (r.respuesta?.orden) ordenes.push(r.respuesta.orden);
        if (esFuera) fuera += 1;
        if (modo === 'DANADO') danados += 1;
        // Lo guardado se quita del formulario: si algo falla, solo queda lo pendiente.
        setValores((s) => { const x = { ...s }; delete x[p.id]; return x; });
        setModos((s) => { const x = { ...s }; delete x[p.id]; return x; });
      }
      setAcciones({});
      setDanos({});
      setResultado({ guardados, sinConexion, fuera, danados, ordenes });
      if (danados) qc.invalidateQueries({ queryKey: ['ordenes'] });
      qc.invalidateQueries({ queryKey: ['calidad'] });
    } catch (err) {
      setError(err);
      if (guardados) qc.invalidateQueries({ queryKey: ['calidad'] });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <PageHeader back={<Link to="/calidad" className="back-link"><Icon name="back" size={18} /> Calidad</Link>} title="Ronda de temperaturas"
        subtitle="Todos los cuartos de una planta en una sola pantalla"
        actions={f.area ? <Link className="btn btn-ghost" to={`/calidad/planilla?area=${encodeURIComponent(f.area)}`}><Icon name="file" /> Planilla del día</Link> : null} />
      {resultado ? (
        <div className={`alert ${resultado.fuera ? 'alert-warn' : 'alert-ok'}`}>
          Se guardaron {resultado.guardados} lectura{resultado.guardados === 1 ? '' : 's'}{resultado.fuera ? ` (${resultado.fuera} fuera de rango, con acción correctiva)` : ''}.
          {resultado.danados ? <> {resultado.danados === 1 ? 'Un equipo quedó' : `${resultado.danados} equipos quedaron`} como dañado
            {resultado.ordenes.length ? <> y se reportó a mantenimiento: {resultado.ordenes.map((o, i) => <span key={o.id}>{i ? ', ' : ''}<Link to={`/ordenes/${o.id}`}>{o.codigo}</Link></span>)}.</> : ' y se reporta a mantenimiento.'}</> : null}
          {resultado.sinConexion ? ` ${resultado.sinConexion} quedaron en el dispositivo y se enviarán al recuperar la señal.` : ''}
        </div>
      ) : null}
      {puntos.isPending ? <Spinner /> : puntos.isError ? <ErrorBox error={puntos.error} /> : !areas.length ? (
        <Empty title="No hay puntos de control configurados" />
      ) : (
        <form className="stack" onSubmit={submit}>
          <section className="card">
            <Field label="Planta o área *">
              {(i) => (
                <Select id={i} value={f.area} onChange={(e) => { set('area', e.target.value); setResultado(null); }} required>
                  <option value="" disabled>Seleccione…</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              )}
            </Field>
          </section>
          {f.area ? (
            <>
              <ul className="ronda">
                {delArea.map((p) => {
                  const modo = modos[p.id];
                  const n = modo ? null : aNumero(valores[p.id]);
                  const esFuera = fueraDe(p, n);
                  return (
                    <li key={p.id} className={`card ronda-item ${esFuera || modo === 'DANADO' ? 'nc' : ''} ${modo === 'DESCANSO' ? 'descanso' : ''}`}>
                      <div className="ronda-info">
                        <strong>{p.activo.nombre}</strong>
                        <span className="muted small">{p.activo.codigo} · {rangoTexto(p.minimo, p.maximo)}{p.ultimo ? ` · última ${lecturaTexto(p.ultimo)} ${hace(p.ultimo.registradoEn)}` : ''}</span>
                      </div>
                      <div className="ronda-entrada">
                        {modo ? (
                          <span className={`ronda-estado ${modo === 'DANADO' ? 'bad' : ''}`}>{modo === 'DESCANSO' ? 'Descanso' : 'Dañado'}</span>
                        ) : (
                          <Input type="number" inputMode="decimal" step="0.1" min="-100" max="400" className={`input ronda-val ${esFuera ? 'input-bad' : ''}`}
                            value={valores[p.id] ?? ''} onChange={(e) => setValores((s) => ({ ...s, [p.id]: e.target.value }))} aria-label={`Temperatura ${p.activo.nombre} (°C)`} placeholder="°C" />
                        )}
                        <button type="button" className={`ronda-cod ${modo === 'DESCANSO' ? 'on' : ''}`} aria-pressed={modo === 'DESCANSO'} title="Descanso: el cuarto está apagado o desocupado"
                          aria-label={`Descanso ${p.activo.nombre}`} onClick={() => alternarModo(p.id, 'DESCANSO')}>D</button>
                        <button type="button" className={`ronda-cod bad ${modo === 'DANADO' ? 'on' : ''}`} aria-pressed={modo === 'DANADO'} title="Dañado: fuera de servicio (se reporta a mantenimiento)"
                          aria-label={`Dañado ${p.activo.nombre}`} onClick={() => alternarModo(p.id, 'DANADO')}>F</button>
                      </div>
                      {modo === 'DANADO' ? (
                        <Textarea className="input ronda-accion" value={danos[p.id] ?? ''} onChange={(e) => setDanos((s) => ({ ...s, [p.id]: e.target.value }))}
                          rows={2} maxLength={2000} aria-label={`Qué tiene ${p.activo.nombre}`} placeholder="¿Qué tiene? Se reporta a mantenimiento *" />
                      ) : null}
                      {esFuera ? (
                        <Textarea className="input ronda-accion" value={acciones[p.id] ?? ''} onChange={(e) => setAcciones((s) => ({ ...s, [p.id]: e.target.value }))}
                          rows={2} maxLength={2000} aria-label={`Acción correctiva ${p.activo.nombre}`} placeholder="Fuera de rango: ¿qué se hizo? *" />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <section className="card stack">
                {faltaAccion.length ? <div className="alert alert-bad" role="alert">Escriba la acción correctiva de: {faltaAccion.map((p) => p.activo.nombre).join(', ')}.</div> : null}
                {faltaDano.length ? <div className="alert alert-bad" role="alert">Escriba qué tiene: {faltaDano.map((p) => p.activo.nombre).join(', ')}.</div> : null}
                {error ? <ErrorBox error={error} /> : null}
                <Button type="submit" busy={enviando} disabled={!llenos.length || faltaAccion.length > 0 || faltaDano.length > 0} className="btn-block btn-lg">
                  Guardar {llenos.length} lectura{llenos.length === 1 ? '' : 's'}
                </Button>
                <p className="muted small" style={{ margin: 0 }}><strong>D</strong>: descanso (apagado o desocupado). <strong>F</strong>: dañado, fuera de servicio; se crea la orden correctiva si la máquina no tiene una abierta. Los cuartos que deje vacíos no se registran. Las lecturas no se pueden editar; el administrador puede anular una con su motivo.</p>
              </section>
            </>
          ) : null}
        </form>
      )}
    </>
  );
}
