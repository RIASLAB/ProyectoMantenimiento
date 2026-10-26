import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Asset, ChecklistItemInfo, ChecklistTemplateInfo, ControlPointInfo, TipoItem } from '../../api/types';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { rangoTexto } from '../../format';

const num = (s: string) => (s.trim() === '' ? null : Number(s));

function PointModal({ punto, open, onClose }: { punto: ControlPointInfo | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const activos = useQuery({ queryKey: ['activos', '', '', ''], queryFn: () => api.get<Asset[]>('/activos'), enabled: open });
  const [f, setF] = useState({ activoId: '', nombre: '', minimo: '', maximo: '', frecuenciaHoras: '', vigente: true });
  useEffect(() => {
    if (!open) return;
    setF(punto
      ? { activoId: punto.activoId, nombre: punto.nombre, minimo: punto.minimo?.toString() ?? '', maximo: punto.maximo?.toString() ?? '', frecuenciaHoras: punto.frecuenciaHoras?.toString() ?? '', vigente: punto.vigente }
      : { activoId: '', nombre: '', minimo: '', maximo: '', frecuenciaHoras: '', vigente: true });
  }, [open, punto]);
  const m = useMutation({
    mutationFn: () => {
      const body = { nombre: f.nombre, minimo: num(f.minimo), maximo: num(f.maximo), frecuenciaHoras: num(f.frecuenciaHoras) };
      return punto ? api.patch(`/calidad/puntos/${punto.id}`, { ...body, vigente: f.vigente }) : api.post('/calidad/puntos', { ...body, activoId: f.activoId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calidad'] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <Modal open={open} title={punto ? 'Editar punto de control' : 'Nuevo punto de control'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="point-form" busy={m.isPending}>Guardar</Button></>}>
      <form id="point-form" className="stack" onSubmit={submit}>
        <Field label="Equipo *">
          {(i) => (
            <Select id={i} value={f.activoId} onChange={set('activoId')} required disabled={!!punto}>
              <option value="" disabled>Seleccione…</option>
              {activos.data?.map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Nombre *" hint="Ej. Temperatura de cámara, Centro térmico del producto">{(i) => <Input id={i} value={f.nombre} onChange={set('nombre')} required minLength={3} maxLength={120} />}</Field>
        <div className="form-grid">
          <Field label="Mínimo (°C)" hint="Vacío = sin mínimo">{(i) => <Input id={i} type="number" step="0.1" value={f.minimo} onChange={set('minimo')} />}</Field>
          <Field label="Máximo (°C)" hint="Vacío = sin máximo">{(i) => <Input id={i} type="number" step="0.1" value={f.maximo} onChange={set('maximo')} />}</Field>
          <Field label="Registrar cada (horas)">{(i) => <Input id={i} type="number" min="1" max="168" value={f.frecuenciaHoras} onChange={set('frecuenciaHoras')} />}</Field>
        </div>
        {punto ? <label className="toggle"><input type="checkbox" checked={f.vigente} onChange={(e) => setF((s) => ({ ...s, vigente: e.target.checked }))} /> Punto vigente</label> : null}
        {punto ? <p className="muted small" style={{ margin: 0 }}>Cambiar los límites no modifica la evaluación de los registros anteriores. El cambio queda en la bitácora.</p> : null}
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

type ItemDraft = { id?: string; texto: string; tipo: TipoItem; obligatorio: boolean; esperado: 'SI' | 'NO'; minimo: string; maximo: string };
const toDraft = (i: ChecklistItemInfo): ItemDraft => ({ id: i.id, texto: i.texto, tipo: i.tipo, obligatorio: i.obligatorio, esperado: i.esperado ?? 'SI', minimo: i.minimo?.toString() ?? '', maximo: i.maximo?.toString() ?? '' });
const nuevoItem = (): ItemDraft => ({ texto: '', tipo: 'SI_NO', obligatorio: true, esperado: 'SI', minimo: '', maximo: '' });

function TemplateModal({ plantilla, open, onClose }: { plantilla: ChecklistTemplateInfo | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [area, setArea] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [vigente, setVigente] = useState(true);
  const [items, setItems] = useState<ItemDraft[]>([]);
  useEffect(() => {
    if (!open) return;
    setNombre(plantilla?.nombre ?? ''); setArea(plantilla?.area ?? ''); setDescripcion(plantilla?.descripcion ?? ''); setVigente(plantilla?.vigente ?? true);
    setItems(plantilla ? plantilla.items.map(toDraft) : [nuevoItem()]);
  }, [open, plantilla]);
  const m = useMutation({
    mutationFn: () => {
      const body = {
        nombre, area: area || null, descripcion: descripcion || null,
        items: items.map((i) => ({
          id: i.id, texto: i.texto, tipo: i.tipo, obligatorio: i.obligatorio,
          ...(i.tipo === 'SI_NO' ? { esperado: i.esperado } : {}),
          ...(i.tipo === 'NUMERO' ? { minimo: num(i.minimo), maximo: num(i.maximo) } : {}),
        })),
      };
      return plantilla ? api.patch(`/calidad/plantillas/${plantilla.id}`, { ...body, vigente }) : api.post('/calidad/plantillas', body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calidad'] }); onClose(); },
  });
  const upd = (k: number, patch: Partial<ItemDraft>) => setItems(items.map((x, j) => (j === k ? { ...x, ...patch } : x)));
  const mover = (k: number, d: -1 | 1) => {
    const n = [...items];
    [n[k], n[k + d]] = [n[k + d], n[k]];
    setItems(n);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <Modal open={open} title={plantilla ? 'Editar plantilla' : 'Nueva plantilla de checklist'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="tpl-form" busy={m.isPending}>Guardar</Button></>}>
      <form id="tpl-form" className="stack" onSubmit={submit}>
        <Field label="Nombre *">{(i) => <Input id={i} value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={3} maxLength={150} />}</Field>
        <Field label="Área">{(i) => <Input id={i} value={area} onChange={(e) => setArea(e.target.value)} maxLength={100} />}</Field>
        <Field label="Instrucciones">{(i) => <Textarea id={i} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} rows={2} />}</Field>
        <p className="subtle-head" style={{ marginBottom: 0 }}>Preguntas</p>
        {items.map((it, k) => (
          <div key={k} className="item-editor">
            <div className="item-editor-head">
              <span className="muted">{k + 1}.</span>
              <Input value={it.texto} onChange={(e) => upd(k, { texto: e.target.value })} placeholder="Pregunta" aria-label={`Pregunta ${k + 1}`} required minLength={3} maxLength={300} />
            </div>
            <div className="item-editor-opts">
              <Select value={it.tipo} onChange={(e) => upd(k, { tipo: e.target.value as TipoItem })} aria-label="Tipo de respuesta">
                <option value="SI_NO">Sí / No</option><option value="NUMERO">Número</option><option value="TEXTO">Texto</option>
              </Select>
              {it.tipo === 'SI_NO' ? (
                <Select value={it.esperado} onChange={(e) => upd(k, { esperado: e.target.value as 'SI' | 'NO' })} aria-label="Respuesta conforme">
                  <option value="SI">Conforme si responde Sí</option><option value="NO">Conforme si responde No</option>
                </Select>
              ) : it.tipo === 'NUMERO' ? (
                <>
                  <Input type="number" step="any" value={it.minimo} onChange={(e) => upd(k, { minimo: e.target.value })} placeholder="Mín." aria-label="Mínimo conforme" />
                  <Input type="number" step="any" value={it.maximo} onChange={(e) => upd(k, { maximo: e.target.value })} placeholder="Máx." aria-label="Máximo conforme" />
                </>
              ) : null}
              <label className="toggle"><input type="checkbox" checked={it.obligatorio} onChange={(e) => upd(k, { obligatorio: e.target.checked })} /> Obligatoria</label>
              <div className="row-actions">
                <button type="button" className="icon-btn" aria-label="Subir" disabled={k === 0} onClick={() => mover(k, -1)}>↑</button>
                <button type="button" className="icon-btn" aria-label="Bajar" disabled={k === items.length - 1} onClick={() => mover(k, 1)}>↓</button>
                <button type="button" className="icon-btn" aria-label="Quitar pregunta" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== k))}><Icon name="trash" size={18} /></button>
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="ghost" onClick={() => setItems([...items, nuevoItem()])}><Icon name="plus" /> Agregar pregunta</Button>
        {plantilla ? <label className="toggle"><input type="checkbox" checked={vigente} onChange={(e) => setVigente(e.target.checked)} /> Plantilla vigente</label> : null}
        {plantilla ? <p className="muted small" style={{ margin: 0 }}>Los checklists ya llenados conservan las preguntas con que se respondieron.</p> : null}
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

export function QualitySetup() {
  const [punto, setPunto] = useState<{ open: boolean; item: ControlPointInfo | null }>({ open: false, item: null });
  const [tpl, setTpl] = useState<{ open: boolean; item: ChecklistTemplateInfo | null }>({ open: false, item: null });
  const puntos = useQuery({ queryKey: ['calidad', 'puntos', 'todos'], queryFn: () => api.get<ControlPointInfo[]>('/calidad/puntos?incluirInactivos=true') });
  const plantillas = useQuery({ queryKey: ['calidad', 'plantillas', 'todas'], queryFn: () => api.get<ChecklistTemplateInfo[]>('/calidad/plantillas?incluirInactivas=true') });

  return (
    <>
      <PageHeader back={<Link to="/calidad" className="back-link"><Icon name="back" size={18} /> Calidad</Link>} title="Configuración de calidad"
        subtitle="Los límites críticos y la frecuencia los define el área de calidad según el plan HACCP." />
      <div className="stack-lg">
        <section className="card">
          <div className="card-head">
            <h2>Puntos de control de temperatura</h2>
            <Button onClick={() => setPunto({ open: true, item: null })}><Icon name="plus" /> Nuevo punto</Button>
          </div>
          {puntos.isPending ? <Spinner /> : !puntos.data?.length ? <Empty title="Aún no hay puntos de control" /> : (
            <ul className="list">
              {puntos.data.map((p) => (
                <li key={p.id} className={`list-row static ${p.vigente ? '' : 'is-off'}`}>
                  <div className="list-main">
                    <strong>{p.activo.codigo} · {p.nombre}</strong>
                    <span className="muted">{rangoTexto(p.minimo, p.maximo)}{p.frecuenciaHoras ? ` · cada ${p.frecuenciaHoras} h` : ''}</span>
                  </div>
                  <div className="list-meta">
                    {!p.vigente ? <Badge tone="muted">Inactivo</Badge> : null}
                    <Button variant="ghost" onClick={() => setPunto({ open: true, item: p })}>Editar</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Plantillas de checklist</h2>
            <Button onClick={() => setTpl({ open: true, item: null })}><Icon name="plus" /> Nueva plantilla</Button>
          </div>
          {plantillas.isPending ? <Spinner /> : !plantillas.data?.length ? <Empty title="Aún no hay plantillas" /> : (
            <ul className="list">
              {plantillas.data.map((t) => (
                <li key={t.id} className={`list-row static ${t.vigente ? '' : 'is-off'}`}>
                  <div className="list-main">
                    <strong>{t.nombre}</strong>
                    <span className="muted">{[t.area, `${t.items.length} preguntas`].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="list-meta">
                    {!t.vigente ? <Badge tone="muted">Inactiva</Badge> : null}
                    <Button variant="ghost" onClick={() => setTpl({ open: true, item: t })}>Editar</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <PointModal punto={punto.item} open={punto.open} onClose={() => setPunto({ open: false, item: null })} />
      <TemplateModal plantilla={tpl.item} open={tpl.open} onClose={() => setTpl({ open: false, item: null })} />
    </>
  );
}
