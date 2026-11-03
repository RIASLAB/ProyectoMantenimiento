import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { LightingPoint, LightingSurvey } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { date, qty } from '../../format';

/** Mediciones de iluminación (formato AC-PMT-MI01). */
export function LightingList() {
  const { can, user } = useAuth();
  const q = useQuery({ queryKey: ['iluminacion', 'mediciones'], queryFn: () => api.get<LightingSurvey[]>('/iluminacion/mediciones') });
  return (
    <>
      <PageHeader back={<Link to="/calidad" className="back-link"><Icon name="back" size={18} /> Calidad</Link>} title="Medición de iluminación"
        subtitle="Tres mediciones por punto en lux; cumple si la media alcanza el mínimo de su tipo de recinto"
        actions={<>
          {can('ADMIN') ? <Link to="/calidad/configuracion#iluminacion" className="btn btn-ghost"><Icon name="settings" /> Puntos</Link> : null}
          {user && can('ADMIN', 'TECNICO') ? <Link to="/calidad/iluminacion/nueva" className="btn btn-primary"><Icon name="plus" /> Nueva medición</Link> : null}
        </>} />
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} /> : !q.data.length ? (
        <Empty title="Aún no hay mediciones de iluminación" />
      ) : (
        <ul className="list">
          {q.data.map((m) => (
            <li key={m.id}>
              <Link to={`/calidad/iluminacion/${m.id}`} className="list-row">
                <div className="list-main">
                  <strong>{date(m.fecha)} · {m.lugar}</strong>
                  <span className="muted">{m.empresa} · {m.evaluador} ({m.cargoEvaluador})</span>
                </div>
                <div className="list-meta">
                  <Badge tone="ok">{m.puntosCumplen} cumplen</Badge>
                  {m.puntosNoCumplen ? <Badge tone="bad">{m.puntosNoCumplen} no cumplen</Badge> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type Fila = { m1: string; m2: string; m3: string; planAccion: string; observaciones: string };
const vacia: Fila = { m1: '', m2: '', m3: '', planAccion: '', observaciones: '' };
const n = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function LightingNew() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const puntos = useQuery({ queryKey: ['iluminacion', 'puntos'], queryFn: () => api.get<LightingPoint[]>('/iluminacion/puntos') });
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [cab, setCab] = useState({ fecha: hoy, empresa: 'NUTRIALIMENTOS', lugar: 'Planta', evaluador: user?.nombre ?? '', cargoEvaluador: '', observaciones: '' });
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const fila = (id: string) => filas[id] ?? vacia;
  const upd = (id: string, patch: Partial<Fila>) => setFilas((s) => ({ ...s, [id]: { ...fila(id), ...patch } }));
  const calc = (p: LightingPoint) => {
    const f = fila(p.id);
    const v = [n(f.m1), n(f.m2), n(f.m3)];
    if (v.some((x) => x === null || !Number.isFinite(x))) return null;
    const media = Math.round(((v[0]! + v[1]! + v[2]!) / 3) * 10) / 10;
    return { media, cumple: media >= p.recinto.minimo };
  };
  const completos = (puntos.data ?? []).filter((p) => calc(p));
  const sinPlan = completos.filter((p) => !calc(p)!.cumple && fila(p.id).planAccion.trim().length < 5);
  const m = useMutation({
    mutationFn: () => api.post<{ id: string }>('/iluminacion/mediciones', {
      ...cab, observaciones: cab.observaciones || undefined,
      lecturas: completos.map((p) => ({
        puntoId: p.id, medicion1: n(fila(p.id).m1), medicion2: n(fila(p.id).m2), medicion3: n(fila(p.id).m3),
        planAccion: fila(p.id).planAccion || undefined, observaciones: fila(p.id).observaciones || undefined,
      })),
    }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['iluminacion'] }); nav(`/calidad/iluminacion/${r.id}`, { replace: true }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <>
      <PageHeader back={<Link to="/calidad/iluminacion" className="back-link"><Icon name="back" size={18} /> Iluminación</Link>} title="Nueva medición de iluminación"
        subtitle="La medición se hace de día. Registre las tres lecturas del luxómetro en cada punto." />
      {puntos.isPending ? <Spinner /> : puntos.isError ? <ErrorBox error={puntos.error} /> : !puntos.data.length ? (
        <Empty title="No hay puntos de medición configurados"><p className="muted">El administrador los crea en Calidad → Configuración.</p></Empty>
      ) : (
        <form className="stack" onSubmit={submit}>
          <section className="card form-grid">
            <Field label="Fecha de medición *">{(i) => <Input id={i} type="date" value={cab.fecha} max={hoy} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} required />}</Field>
            <Field label="Empresa *">
              {(i) => (
                <Select id={i} value={cab.empresa} onChange={(e) => setCab({ ...cab, empresa: e.target.value })}>
                  <option value="NUTRIALIMENTOS">Nutrialimentos</option><option value="INDUCARNES">Inducarnes</option>
                </Select>
              )}
            </Field>
            <Field label="Lugar *" hint='"Planta" o el nombre del punto de venta'>{(i) => <Input id={i} value={cab.lugar} onChange={(e) => setCab({ ...cab, lugar: e.target.value })} required minLength={2} maxLength={120} />}</Field>
            <Field label="Nombre del evaluador *">{(i) => <Input id={i} value={cab.evaluador} onChange={(e) => setCab({ ...cab, evaluador: e.target.value })} required minLength={3} maxLength={120} />}</Field>
            <Field label="Cargo del evaluador *">{(i) => <Input id={i} value={cab.cargoEvaluador} onChange={(e) => setCab({ ...cab, cargoEvaluador: e.target.value })} required minLength={3} maxLength={120} />}</Field>
          </section>
          <ol className="check-items">
            {puntos.data.map((p) => {
              const c = calc(p);
              const f = fila(p.id);
              return (
                <li key={p.id} className={`card lux-item ${c && !c.cumple ? 'nc' : ''}`}>
                  <div className="lux-head">
                    <div><strong>{p.orden}. {p.nombre}</strong><span className="muted small" style={{ display: 'block' }}>{p.recinto.nombre} · mínimo {p.recinto.minimo} lux</span></div>
                    {c ? <Badge tone={c.cumple ? 'ok' : 'bad'}>Media {qty(c.media)} lux · {c.cumple ? 'Cumple' : 'No cumple'}</Badge> : null}
                  </div>
                  <div className="lux-vals">
                    {(['m1', 'm2', 'm3'] as const).map((k, j) => (
                      <Input key={k} type="number" inputMode="decimal" min="0" step="0.1" value={f[k]} onChange={(e) => upd(p.id, { [k]: e.target.value })}
                        aria-label={`${p.nombre}: medición ${j + 1}`} placeholder={`Medición ${j + 1}`} />
                    ))}
                  </div>
                  {c && !c.cumple ? (
                    <Textarea value={f.planAccion} onChange={(e) => upd(p.id, { planAccion: e.target.value })} rows={2} maxLength={1000}
                      aria-label={`Plan de acción ${p.nombre}`} placeholder="Plan de acción * (ej. cambiar las lámparas, limpiar los difusores)" />
                  ) : null}
                  {c ? (
                    <Input value={f.observaciones} onChange={(e) => upd(p.id, { observaciones: e.target.value })} maxLength={1000} aria-label={`Observaciones ${p.nombre}`} placeholder="Observaciones" />
                  ) : null}
                </li>
              );
            })}
          </ol>
          <section className="card stack">
            <p style={{ margin: 0 }}><strong>{completos.length}</strong> de {puntos.data.length} puntos medidos · {completos.filter((p) => calc(p)!.cumple).length} cumplen. Los puntos sin las tres mediciones no se registran.</p>
            {sinPlan.length ? <div className="alert alert-bad" role="alert">Escriba el plan de acción de: {sinPlan.map((p) => p.nombre).join(', ')}.</div> : null}
            <Field label="Observaciones generales">{(i) => <Textarea id={i} value={cab.observaciones} onChange={(e) => setCab({ ...cab, observaciones: e.target.value })} maxLength={2000} />}</Field>
            {m.isError ? <ErrorBox error={m.error} /> : null}
            <Button type="submit" busy={m.isPending} disabled={!completos.length || sinPlan.length > 0} className="btn-block btn-lg">Guardar medición</Button>
          </section>
        </form>
      )}
    </>
  );
}
