import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, openProtectedFile, qs } from '../../api/client';
import type { ChecklistRecordInfo, ChecklistTemplateInfo, ControlPointInfo, QualitySummary, TemperatureRecordInfo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { SavedOfflineNotice, Badge, Button, Empty, ErrorBox, Field, Icon, Input, Modal, PageHeader, Spinner, Textarea } from '../../components/ui';
import { dateTime, hace, rangoTexto, valorChecklist, lecturaTexto } from '../../format';
import { useUrlFilters } from '../../hooks';

function VoidModal({ target, onClose }: { target: { tipo: 'TEMPERATURA' | 'CHECKLIST'; id: string; resumen: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const m = useMutation({
    mutationFn: () => api.post('/calidad/anulaciones', { tipo: target!.tipo, registroId: target!.id, motivo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calidad'] }); setMotivo(''); onClose(); },
  });
  return (
    <Modal open={!!target} title="Anular registro" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Volver</Button><Button variant="danger" busy={m.isPending} disabled={motivo.trim().length < 5} onClick={() => m.mutate()}>Anular</Button></>}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>{target?.resumen}</p>
        <p className="small" style={{ margin: 0 }}>El registro original se conserva y queda marcado como anulado, con su motivo, en los reportes de auditoría.</p>
        <Field label="Motivo *">{(i) => <Textarea id={i} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />}</Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </div>
    </Modal>
  );
}

export function QualityHome() {
  const { can } = useAuth();
  const location = useLocation();
  const guardado = (location.state as { guardado?: string } | null)?.guardado;
  const [f, set] = useUrlFilters(['vista', 'desde', 'hasta', 'desviaciones'] as const);
  const vista = f.vista || 'temperaturas';
  const [anular, setAnular] = useState<{ tipo: 'TEMPERATURA' | 'CHECKLIST'; id: string; resumen: string } | null>(null);
  const [exportError, setExportError] = useState('');

  const resumen = useQuery({ queryKey: ['calidad', 'resumen'], queryFn: () => api.get<QualitySummary>('/calidad/resumen'), refetchInterval: 60_000 });
  const puntos = useQuery({ queryKey: ['calidad', 'puntos'], queryFn: () => api.get<ControlPointInfo[]>('/calidad/puntos'), refetchInterval: 60_000 });
  const plantillas = useQuery({ queryKey: ['calidad', 'plantillas'], queryFn: () => api.get<ChecklistTemplateInfo[]>('/calidad/plantillas') });
  const filtros = qs({ desde: f.desde, hasta: f.hasta, soloDesviaciones: f.desviaciones === 'true' });
  const temps = useQuery({
    queryKey: ['calidad', 'temperaturas', filtros],
    queryFn: () => api.get<TemperatureRecordInfo[]>(`/calidad/temperaturas${filtros}`),
    enabled: vista === 'temperaturas',
  });
  const checks = useQuery({
    queryKey: ['calidad', 'checklists', filtros],
    queryFn: () => api.get<ChecklistRecordInfo[]>(`/calidad/checklists${filtros}`),
    enabled: vista === 'checklists',
  });

  const exportar = async () => {
    setExportError('');
    try {
      await openProtectedFile(`/calidad/exportar/${vista}${qs({ desde: f.desde, hasta: f.hasta })}`, `registros-${vista}-${new Date().toISOString().slice(0, 10)}.csv`, true);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo exportar');
    }
  };

  const r = resumen.data;
  const porArea = (() => {
    const m = new Map<string, ControlPointInfo[]>();
    for (const p of puntos.data ?? []) m.set(p.activo.area, [...(m.get(p.activo.area) ?? []), p]);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  })();
  const etiquetas = new Map((plantillas.data ?? []).flatMap((t) => t.items.map((i) => [i.id, i.etiqueta] as const)));
  return (
    <>
      <PageHeader
        title="Calidad HACCP / BPM"
        actions={can('ADMIN') ? <Link to="/calidad/configuracion" className="btn btn-ghost"><Icon name="settings" /> Configuración</Link> : null}
      />
      <SavedOfflineNotice que={(location.state as { guardadoSinConexion?: string } | null)?.guardadoSinConexion} />
      {guardado ? <div className="alert alert-ok">Checklist “{guardado}” guardado.</div> : null}

      <div className="quick-actions">
        <Link to="/calidad/temperatura" className="quick"><Icon name="thermo" size={28} /><span>Registrar temperatura</span></Link>
        <Link to="/calidad/ronda" className="quick"><Icon name="thermo" size={28} /><span>Ronda de temperaturas</span></Link>
        <a href="#checklists" className="quick"><Icon name="clipboard" size={28} /><span>Llenar checklist</span></a>
        <Link to="/calidad/planilla" className="quick"><Icon name="file" size={28} /><span>Planilla de temperaturas</span></Link>
        <Link to="/calidad/semana" className="quick"><Icon name="calendar" size={28} /><span>Preoperacional de la semana</span></Link>
        <Link to="/calidad/iluminacion" className="quick"><Icon name="chart" size={28} /><span>Medición de iluminación</span></Link>
        <Link to="/calidad/instrumentos" className="quick"><Icon name="settings" size={28} /><span>Calibración de instrumentos</span></Link>
        <Link to="/calidad/paquete" className="quick"><Icon name="download" size={28} /><span>Paquete mensual para auditoría</span></Link>
      </div>

      {r ? (
        <div className="chips">
          <span className="chip"><strong>{r.temperaturas24h}</strong> temperaturas en 24 h</span>
          <span className={`chip ${r.desviaciones24h ? 'chip-bad' : ''}`}><strong>{r.desviaciones24h}</strong> fuera de rango</span>
          <span className="chip"><strong>{r.checklists24h}</strong> checklists en 24 h</span>
          {r.checklistsNoConformes24h ? <span className="chip chip-bad"><strong>{r.checklistsNoConformes24h}</strong> con no conformidades</span> : null}
          {r.puntosAtrasados ? <span className="chip chip-warn"><strong>{r.puntosAtrasados}</strong> punto{r.puntosAtrasados === 1 ? '' : 's'} sin registro a tiempo</span> : null}
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <h2>Puntos de control</h2>
          {puntos.isPending ? <Spinner /> : !puntos.data?.length ? <Empty title="Sin puntos configurados" /> : porArea.map(([area, lista]) => (
            <details key={area} className="area-group" open={porArea.length === 1}>
              <summary>
                <strong>{area}</strong>
                <span className="muted small"> · {lista.length} punto{lista.length === 1 ? '' : 's'}</span>
                {lista.some((p) => p.atrasado) ? <> <Badge tone="warn">{lista.filter((p) => p.atrasado).length} por registrar</Badge></> : null}
                {lista.some((p) => p.ultimo?.fueraDeRango) ? <> <Badge tone="bad">{lista.filter((p) => p.ultimo?.fueraDeRango).length} fuera de rango</Badge></> : null}
              </summary>
            <ul className="points">
              {lista.map((p) => (
                <li key={p.id}>
                  <Link to={`/calidad/temperatura?punto=${p.id}`} className="point">
                    <div>
                      <strong>{p.activo.codigo} · {p.nombre}</strong>
                      <span className="muted small">{p.activo.nombre} · {rangoTexto(p.minimo, p.maximo)}{p.frecuenciaHoras ? ` · cada ${p.frecuenciaHoras} h` : ''}</span>
                    </div>
                    <div className="point-last">
                      {p.ultimo ? (
                        <>
                          <span className={`point-val ${p.ultimo.fueraDeRango || p.ultimo.estado === 'DANADO' ? 'text-bad' : ''}`}>{lecturaTexto(p.ultimo)}</span>
                          <span className="muted small">{hace(p.ultimo.registradoEn)}</span>
                        </>
                      ) : <span className="muted small">Sin lecturas</span>}
                      {p.atrasado ? <Badge tone="warn">Toca registrar</Badge> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
              <p className="area-links"><Link to={`/calidad/ronda?area=${encodeURIComponent(area)}`}>Registrar ronda</Link> · <Link to={`/calidad/planilla?area=${encodeURIComponent(area)}`}>Planilla del día</Link></p>
            </details>
          ))}
        </section>

        <section className="card" id="checklists">
          <h2>Checklists</h2>
          {plantillas.isPending ? <Spinner /> : !plantillas.data?.length ? <Empty title="Sin plantillas configuradas" /> : (
            <ul className="points">
              {plantillas.data.map((t) => (
                <li key={t.id}>
                  <Link to={`/calidad/checklist/${t.id}`} className="point">
                    <div>
                      <strong>{t.nombre}</strong>
                      <span className="muted small">{[t.area, t.activo?.codigo, t.codigo, `${t.items.filter((i) => i.tipo !== 'SECCION').length} preguntas`].filter(Boolean).join(' · ')}</span>
                    </div>
                    <span className="btn btn-secondary">Llenar</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Registros</h2>
          {can('ADMIN', 'AUTORIZADOR') ? <Button variant="secondary" onClick={exportar}><Icon name="download" /> Exportar {vista === 'temperaturas' ? 'temperaturas' : 'checklists'}</Button> : null}
        </div>
        {exportError ? <div className="alert alert-bad">{exportError}</div> : null}
        <nav className="tabs" role="tablist" aria-label="Tipo de registro">
          <button type="button" role="tab" className="tab" aria-selected={vista === 'temperaturas'} onClick={() => set('vista', '')}>Temperaturas</button>
          <button type="button" role="tab" className="tab" aria-selected={vista === 'checklists'} onClick={() => set('vista', 'checklists')}>Checklists</button>
        </nav>
        <div className="toolbar">
          <Input type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} aria-label="Desde" />
          <Input type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} aria-label="Hasta" min={f.desde || undefined} />
          <label className="toggle"><input type="checkbox" checked={f.desviaciones === 'true'} onChange={(e) => set('desviaciones', e.target.checked ? 'true' : '')} /> Solo desviaciones</label>
        </div>
        {!f.desde && !f.hasta ? <p className="muted small" style={{ marginTop: 0 }}>Mostrando los últimos 7 días.</p> : null}

        {vista === 'temperaturas' ? (
          temps.isPending ? <Spinner /> : temps.isError ? <ErrorBox error={temps.error} /> : temps.data.length === 0 ? <Empty title="Sin registros en el período" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Lectura</th><th>Equipo / punto</th><th className="num">Valor</th><th>Rango</th><th>Acción correctiva</th><th>Usuario</th><th /></tr></thead>
                <tbody>
                  {temps.data.map((t) => (
                    <tr key={t.id} className={t.anulacion ? 'voided' : ''}>
                      <td data-label="Lectura">{dateTime(t.registradoEn)}</td>
                      <td data-label="Equipo">{t.activo.codigo} · {t.punto.nombre}</td>
                      <td data-label="Valor" className={`num ${t.fueraDeRango || t.estado === 'DANADO' ? 'text-bad' : ''}`}><strong>{lecturaTexto(t)}</strong></td>
                      <td data-label="Rango">{rangoTexto(t.limiteMinimo, t.limiteMaximo)}{t.fueraDeRango ? <> <Badge tone="bad">Fuera</Badge></> : null}</td>
                      <td data-label="Acción">{t.accionCorrectiva ?? t.observacion ?? '—'}</td>
                      <td data-label="Usuario">{t.usuario.nombre}</td>
                      <td data-label="">
                        {t.anulacion ? <Badge tone="muted">Anulado: {t.anulacion.motivo}</Badge>
                          : can('ADMIN') ? <Button variant="ghost" onClick={() => setAnular({ tipo: 'TEMPERATURA', id: t.id, resumen: `${t.activo.codigo} · ${t.punto.nombre}: ${lecturaTexto(t)} (${dateTime(t.registradoEn)})` })}>Anular</Button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : checks.isPending ? <Spinner /> : checks.isError ? <ErrorBox error={checks.error} /> : checks.data.length === 0 ? <Empty title="Sin checklists en el período" /> : (
          <ul className="list">
            {checks.data.map((c) => (
              <li key={c.id} className={`list-row static ${c.anulacion ? 'is-off' : ''}`}>
                <details className="list-main">
                  <summary>
                    <strong>{c.plantillaNombre}</strong>{c.activo ? <span className="muted"> · {c.activo.codigo}</span> : null}
                    <span className="muted small" style={{ display: 'block' }}>{dateTime(c.registradoEn)} · {c.usuario.nombre}</span>
                  </summary>
                  <ul className="answers">
                    {c.respuestas.map((a) => (a.tipo === 'SECCION' ? (
                      <li key={a.itemId} className="answers-sec">{a.texto}</li>
                    ) : (
                      <li key={a.itemId} className={a.conforme ? '' : 'text-bad'}>
                        {a.conforme ? '' : '✗ '}{a.texto}: <strong>{valorChecklist({ ...a, etiqueta: etiquetas.get(a.itemId) })}</strong>
                        {a.observacion ? <span className="muted"> — {a.observacion}</span> : null}
                      </li>
                    )))}
                  </ul>
                  <p className="small" style={{ display: 'flex', gap: 12 }}>
                    <Link to={`/imprimir/checklist/${c.id}`}>Ver formato</Link>
                    <Link to={`/calidad/semana?${new URLSearchParams({ plantilla: c.plantillaId, activo: c.activo?.id ?? '', semana: c.registradoEn.slice(0, 10) })}`}>Semana</Link>
                  </p>
                  {c.accionCorrectiva ? <p className="small"><strong>Acción correctiva:</strong> {c.accionCorrectiva}</p> : null}
                  {c.observaciones ? <p className="small"><strong>Observaciones:</strong> {c.observaciones}</p> : null}
                </details>
                <div className="list-meta">
                  {c.noConformes ? <Badge tone="bad">{c.noConformes} no conforme{c.noConformes === 1 ? '' : 's'}</Badge> : <Badge tone="ok">Conforme</Badge>}
                  {c.anulacion ? <Badge tone="muted">Anulado: {c.anulacion.motivo}</Badge>
                    : can('ADMIN') ? <Button variant="ghost" onClick={() => setAnular({ tipo: 'CHECKLIST', id: c.id, resumen: `${c.plantillaNombre} (${dateTime(c.registradoEn)})` })}>Anular</Button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <VoidModal target={anular} onClose={() => setAnular(null)} />
    </>
  );
}
