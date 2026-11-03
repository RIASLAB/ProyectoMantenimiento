import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, uuid } from '../../api/client';
import type { Asset, ChecklistItemInfo, ChecklistTemplateInfo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { ESCALA, ETIQUETAS_SI_NO } from '../../format';
import { enviarOEncolar } from '../../offline/outbox';

type Valor = string;

function conforme(item: ChecklistItemInfo, v: Valor | undefined): boolean | null {
  if (v === undefined || v === '') return null;
  if (v === 'NA') return true;
  if (item.tipo === 'SI_NO') return v === (item.esperado ?? 'SI');
  if (item.tipo === 'ESCALA') return v !== 'M' && v !== 'NT';
  if (item.tipo === 'NUMERO') {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return (item.minimo === null || item.minimo === undefined || n >= item.minimo) && (item.maximo === null || item.maximo === undefined || n <= item.maximo);
  }
  return true;
}

/** Respuesta "buena" de un ítem, para marcar de una vez lo pendiente (lo más común en un preoperacional). */
const valorBueno = (i: ChecklistItemInfo) => (i.tipo === 'ESCALA' ? 'B' : i.tipo === 'SI_NO' ? (i.esperado ?? 'SI') : null);

/** Grupos del formato: cada título de sección con sus ítems (los ítems antes del primer título van sin título). */
function agrupar(items: ChecklistItemInfo[]) {
  const grupos: Array<{ titulo: ChecklistItemInfo | null; items: ChecklistItemInfo[] }> = [];
  for (const i of items) {
    if (i.tipo === 'SECCION') grupos.push({ titulo: i, items: [] });
    else {
      if (!grupos.length) grupos.push({ titulo: null, items: [] });
      grupos.at(-1)!.items.push(i);
    }
  }
  return grupos;
}

/** CAL-04: llenado de un checklist; las respuestas no conformes se resaltan mientras se responde. */
export function FillChecklist() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [obsItem, setObsItem] = useState<Record<string, string>>({});
  const [obsAbierta, setObsAbierta] = useState<Record<string, boolean>>({});
  const [activoId, setActivoId] = useState('');
  const [obs, setObs] = useState('');
  const [accion, setAccion] = useState('');
  const [clientId] = useState(() => uuid());
  const { user } = useAuth();

  const p = useQuery({ queryKey: ['calidad', 'plantilla', id], queryFn: () => api.get<ChecklistTemplateInfo>(`/calidad/plantillas/${id}`) });
  const activos = useQuery({ queryKey: ['activos', '', '', ''], queryFn: () => api.get<Asset[]>('/activos'), enabled: !!p.data && !p.data.activoId });

  const preguntas = p.data?.items.filter((i) => i.tipo !== 'SECCION') ?? [];
  const noConformes = preguntas.filter((i) => conforme(i, valores[i.id]) === false);
  const regularesSinObs = preguntas.filter((i) => i.tipo === 'ESCALA' && valores[i.id] === 'R' && (obsItem[i.id] ?? '').trim().length < 3);
  const pendientes = preguntas.filter((i) => valorBueno(i) && !valores[i.id]);
  const m = useMutation({
    mutationFn: () => enviarOEncolar({
      usuarioId: user!.id, tipo: 'checklist', method: 'POST', path: '/calidad/checklists',
      resumen: `${p.data!.nombre}${noConformes.length ? ` (${noConformes.length} no conforme${noConformes.length === 1 ? '' : 's'})` : ''}`,
      body: {
        plantillaId: id,
        activoId: activoId || undefined,
        respuestas: preguntas.map((i) => ({
          itemId: i.id,
          valor: valores[i.id] === undefined || valores[i.id] === '' ? null : i.tipo === 'NUMERO' ? Number(valores[i.id]) : valores[i.id],
          ...(obsItem[i.id]?.trim() ? { observacion: obsItem[i.id].trim() } : {}),
        })),
        observaciones: obs || undefined,
        accionCorrectiva: noConformes.length ? accion : undefined,
        clientId,
        registradoEn: new Date().toISOString(),
      },
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['calidad'] });
      nav('/calidad?vista=checklists', { state: r.encolado ? { guardadoSinConexion: `El checklist “${p.data!.nombre}”` } : { guardado: p.data!.nombre } });
    },
  });
  const set = (k: string, v: string) => {
    setValores((s) => ({ ...s, [k]: v }));
    if (v === 'R') setObsAbierta((s) => ({ ...s, [k]: true }));
  };
  const marcarBuenos = (items: ChecklistItemInfo[]) => {
    const nuevos: Record<string, string> = {};
    for (const i of items) {
      const b = valorBueno(i);
      if (b && !valores[i.id]) nuevos[i.id] = b;
    }
    setValores((s) => ({ ...s, ...nuevos }));
  };
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  const back = <Link to="/calidad" className="back-link"><Icon name="back" size={18} /> Calidad</Link>;
  if (p.isPending) return <Spinner />;
  if (p.isError) return <>{back}<ErrorBox error={p.error} /></>;
  const t = p.data;
  const grupos = agrupar(t.items);
  const usaEscala = preguntas.some((i) => i.tipo === 'ESCALA');
  const usaCnc = preguntas.some((i) => i.tipo === 'SI_NO' && i.etiqueta === 'C_NC');
  let n = 0;

  return (
    <>
      <PageHeader back={back} title={t.nombre}
        subtitle={[t.area, t.activo ? `${t.activo.codigo} · ${t.activo.nombre}` : null, t.codigo ? `${t.codigo}${t.version ? ` v${t.version}` : ''}` : null].filter(Boolean).join(' · ') || undefined} />
      <form className="stack" onSubmit={submit}>
        {t.descripcion ? <p className="muted" style={{ margin: 0 }}>{t.descripcion}</p> : null}
        {t.recomendacion ? <div className="alert alert-warn"><span><strong>Recomendación:</strong> {t.recomendacion}</span></div> : null}
        {/* Las hojas diarias cubren todos los equipos de la planta: no se elige uno. */}
        {!t.activoId && !t.items.some((i) => i.tipo === 'SECCION') ? (
          <section className="card">
            <Field label="Equipo (opcional)">
              {(i) => (
                <Select id={i} value={activoId} onChange={(e) => setActivoId(e.target.value)}>
                  <option value="">General / no aplica</option>
                  {activos.data?.filter((a) => a.estado !== 'DADO_DE_BAJA' && a.estado !== 'EN_BODEGA').map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
                </Select>
              )}
            </Field>
          </section>
        ) : null}

        {pendientes.length > 1 ? (
          <div className="fill-bar">
            <span className="muted small">{usaEscala ? 'B bueno · R regular · M malo · No: no tiene · NA no aplica' : usaCnc ? 'C cumple · NC no cumple · NA no aplica' : `${preguntas.length} preguntas`}</span>
            <Button type="button" variant="secondary" onClick={() => marcarBuenos(preguntas)}>
              <Icon name="check" /> Marcar lo pendiente como {usaEscala ? 'bueno' : 'cumple'} ({pendientes.length})
            </Button>
          </div>
        ) : null}

        {grupos.map((g, gi) => (
          <section key={g.titulo?.id ?? `g${gi}`} className="check-group">
            {g.titulo ? (
              <div className="check-section">
                <h2>{g.titulo.texto}</h2>
                {g.items.some((i) => valorBueno(i) && !valores[i.id]) ? (
                  <button type="button" className="link-btn" onClick={() => marcarBuenos(g.items)}>Todo {usaEscala ? 'bueno' : 'cumple'}</button>
                ) : null}
              </div>
            ) : null}
            <ol className="check-items" start={n + 1}>
              {g.items.map((item) => {
                n += 1;
                const ok = conforme(item, valores[item.id]);
                const v = valores[item.id];
                const verObs = obsAbierta[item.id] || !!obsItem[item.id];
                const faltaObs = item.tipo === 'ESCALA' && v === 'R' && (obsItem[item.id] ?? '').trim().length < 3;
                return (
                  <li key={item.id} className={`card check-item ${ok === false ? 'nc' : ''} ${item.tipo === 'SI_NO' || item.tipo === 'ESCALA' ? 'check-inline' : ''}`}>
                    <p className="check-q"><span className="muted">{n}.</span> {item.texto}{item.obligatorio ? ' *' : ''}</p>
                    {item.tipo === 'SI_NO' ? (
                      <div className="seg" role="radiogroup" aria-label={item.texto} style={{ gridTemplateColumns: `repeat(${item.permiteNA ? 3 : 2}, minmax(0, 1fr))` }}>
                        {(['SI', 'NO', ...(item.permiteNA ? ['NA' as const] : [])] as Array<'SI' | 'NO' | 'NA'>).map((x) => (
                          <button key={x} type="button" role="radio" aria-checked={v === x} className={`seg-btn ${v === x ? 'on' : ''}`} onClick={() => set(item.id, x)}>
                            {x === 'NA' ? 'NA' : item.etiqueta === 'C_NC' ? ETIQUETAS_SI_NO.C_NC.corto[x] : ETIQUETAS_SI_NO[item.etiqueta ?? 'SI_NO'][x]}
                          </button>
                        ))}
                      </div>
                    ) : item.tipo === 'ESCALA' ? (
                      <div className="seg seg-escala" role="radiogroup" aria-label={item.texto}>
                        {ESCALA.map((x) => (
                          <button key={x.v} type="button" role="radio" aria-checked={v === x.v} title={x.largo} aria-label={x.largo}
                            className={`seg-btn ${v === x.v ? `on esc-${x.v}` : ''}`} onClick={() => set(item.id, x.v)}>{x.corto}</button>
                        ))}
                      </div>
                    ) : item.tipo === 'NUMERO' ? (
                      <Input type="number" inputMode="decimal" step="any" value={v ?? ''} onChange={(e) => set(item.id, e.target.value)} aria-label={item.texto}
                        placeholder={item.minimo !== undefined && item.minimo !== null && item.maximo !== undefined && item.maximo !== null ? `${item.minimo} a ${item.maximo}` : undefined} />
                    ) : (
                      <Textarea value={v ?? ''} onChange={(e) => set(item.id, e.target.value)} aria-label={item.texto} rows={2} maxLength={1000} />
                    )}
                    {item.tipo !== 'TEXTO' ? (
                      verObs ? (
                        <Input className={`input check-obs ${faltaObs ? 'input-warn' : ''}`} value={obsItem[item.id] ?? ''} maxLength={500}
                          onChange={(e) => setObsItem((s) => ({ ...s, [item.id]: e.target.value }))}
                          aria-label={`Observación: ${item.texto}`} placeholder={v === 'R' ? '¿Qué está regular? *' : 'Observación'} />
                      ) : (
                        <button type="button" className="link-btn check-obs-btn" onClick={() => setObsAbierta((s) => ({ ...s, [item.id]: true }))}>+ Observación</button>
                      )
                    ) : null}
                    {ok === false ? <p className="field-error" style={{ marginTop: 6 }}>No conforme</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        <section className="card stack">
          {regularesSinObs.length ? (
            <div className="alert alert-warn" role="alert">Escriba qué está regular en: {regularesSinObs.map((i) => i.texto).join('; ')}.</div>
          ) : null}
          {noConformes.length ? (
            <>
              <div className="alert alert-bad" role="alert">{noConformes.length} punto{noConformes.length === 1 ? '' : 's'} no conforme{noConformes.length === 1 ? '' : 's'}. Registre la acción correctiva.</div>
              <Field label="Acción correctiva *">{(i) => <Textarea id={i} value={accion} onChange={(e) => setAccion(e.target.value)} required minLength={5} maxLength={2000} />}</Field>
            </>
          ) : null}
          <Field label="Observaciones">{(i) => <Textarea id={i} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} />}</Field>
          {m.isError ? <ErrorBox error={m.error} /> : null}
          <Button type="submit" busy={m.isPending} disabled={regularesSinObs.length > 0} className="btn-block btn-lg">Guardar checklist</Button>
        </section>
      </form>
    </>
  );
}
