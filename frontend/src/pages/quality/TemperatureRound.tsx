import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uuid } from '../../api/client';
import type { ControlPointInfo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, Empty, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { hace, qty, rangoTexto } from '../../format';
import { useUrlFilters } from '../../hooks';
import { enviarOEncolar } from '../../offline/outbox';

const aNumero = (s: string | undefined) => (s === undefined || s.trim() === '' ? null : Number(s.replace(',', '.')));
const fueraDe = (p: ControlPointInfo, n: number | null) => n !== null && Number.isFinite(n) && ((p.minimo !== null && n < p.minimo) || (p.maximo !== null && n > p.maximo));

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
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resultado, setResultado] = useState<{ guardados: number; sinConexion: number; fuera: number } | null>(null);

  const puntos = useQuery({ queryKey: ['calidad', 'puntos'], queryFn: () => api.get<ControlPointInfo[]>('/calidad/puntos') });
  const areas = useMemo(() => [...new Set((puntos.data ?? []).map((p) => p.activo.area))].sort((a, b) => a.localeCompare(b)), [puntos.data]);
  const delArea = (puntos.data ?? []).filter((p) => p.activo.area === f.area);
  const llenos = delArea.filter((p) => aNumero(valores[p.id]) !== null);
  const faltaAccion = llenos.filter((p) => fueraDe(p, aNumero(valores[p.id])) && (acciones[p.id] ?? '').trim().length < 5);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError(null);
    const registradoEn = new Date().toISOString();
    let guardados = 0; let sinConexion = 0; let fuera = 0;
    try {
      for (const p of llenos) {
        const n = aNumero(valores[p.id])!;
        const esFuera = fueraDe(p, n);
        const r = await enviarOEncolar({
          usuarioId: user!.id, tipo: 'temperatura', method: 'POST', path: '/calidad/temperaturas',
          resumen: `${p.activo.codigo} · ${p.activo.nombre}: ${qty(n)} °C${esFuera ? ' (fuera de rango)' : ''}`,
          body: { puntoId: p.id, valor: n, accionCorrectiva: esFuera ? acciones[p.id] : undefined, clientId: uuid(), registradoEn },
        });
        guardados += 1;
        if (r.encolado) sinConexion += 1;
        if (esFuera) fuera += 1;
        // Lo guardado se quita del formulario: si algo falla, solo queda lo pendiente.
        setValores((s) => { const x = { ...s }; delete x[p.id]; return x; });
      }
      setAcciones({});
      setResultado({ guardados, sinConexion, fuera });
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
                  const n = aNumero(valores[p.id]);
                  const esFuera = fueraDe(p, n);
                  return (
                    <li key={p.id} className={`card ronda-item ${esFuera ? 'nc' : ''}`}>
                      <div className="ronda-info">
                        <strong>{p.activo.nombre}</strong>
                        <span className="muted small">{p.activo.codigo} · {rangoTexto(p.minimo, p.maximo)}{p.ultimo ? ` · última ${qty(p.ultimo.valor)} °C ${hace(p.ultimo.registradoEn)}` : ''}</span>
                      </div>
                      <Input type="number" inputMode="decimal" step="0.1" min="-100" max="400" className={`input ronda-val ${esFuera ? 'input-bad' : ''}`}
                        value={valores[p.id] ?? ''} onChange={(e) => setValores((s) => ({ ...s, [p.id]: e.target.value }))} aria-label={`Temperatura ${p.activo.nombre} (°C)`} placeholder="°C" />
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
                {error ? <ErrorBox error={error} /> : null}
                <Button type="submit" busy={enviando} disabled={!llenos.length || faltaAccion.length > 0} className="btn-block btn-lg">
                  Guardar {llenos.length} lectura{llenos.length === 1 ? '' : 's'}
                </Button>
                <p className="muted small" style={{ margin: 0 }}>Los cuartos que deje vacíos no se registran. Las lecturas no se pueden editar; el administrador puede anular una con su motivo.</p>
              </section>
            </>
          ) : null}
        </form>
      )}
    </>
  );
}
