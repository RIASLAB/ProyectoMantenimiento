import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Asset, ChecklistItemInfo, ChecklistTemplateInfo, ControlPointInfo, EtiquetaSiNo, LightingPoint, LightingRoomType, TipoItem } from '../../api/types';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { ETIQUETAS_SI_NO, rangoTexto } from '../../format';

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

type ItemDraft = { id?: string; texto: string; tipo: TipoItem; obligatorio: boolean; esperado: 'SI' | 'NO'; etiqueta: EtiquetaSiNo; permiteNA: boolean; minimo: string; maximo: string };
const toDraft = (i: ChecklistItemInfo): ItemDraft => ({
  id: i.id, texto: i.texto, tipo: i.tipo, obligatorio: i.obligatorio, esperado: i.esperado ?? 'SI', etiqueta: i.etiqueta ?? 'SI_NO', permiteNA: !!i.permiteNA,
  minimo: i.minimo?.toString() ?? '', maximo: i.maximo?.toString() ?? '',
});
const nuevoItem = (tipo: TipoItem = 'SI_NO'): ItemDraft => ({ texto: '', tipo, obligatorio: tipo !== 'SECCION', esperado: 'SI', etiqueta: 'SI_NO', permiteNA: false, minimo: '', maximo: '' });
const docVacio = { codigo: '', version: '', fechaElaboracion: '', fechaActualizacion: '', recomendacion: '', recordarHora: '' };

function TemplateModal({ plantilla, open, onClose }: { plantilla: ChecklistTemplateInfo | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [area, setArea] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [vigente, setVigente] = useState(true);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [doc, setDoc] = useState(docVacio);
  useEffect(() => {
    if (!open) return;
    setNombre(plantilla?.nombre ?? ''); setArea(plantilla?.area ?? ''); setDescripcion(plantilla?.descripcion ?? ''); setVigente(plantilla?.vigente ?? true);
    setDoc(plantilla ? {
      codigo: plantilla.codigo ?? '', version: plantilla.version ?? '', fechaElaboracion: plantilla.fechaElaboracion ?? '',
      fechaActualizacion: plantilla.fechaActualizacion ?? '', recomendacion: plantilla.recomendacion ?? '',
      recordarHora: plantilla.recordarHora === null ? '' : String(plantilla.recordarHora),
    } : docVacio);
    setItems(plantilla ? plantilla.items.map(toDraft) : [nuevoItem()]);
  }, [open, plantilla]);
  const m = useMutation({
    mutationFn: () => {
      const body = {
        nombre, area: area || null, descripcion: descripcion || null,
        codigo: doc.codigo || null, version: doc.version || null, fechaElaboracion: doc.fechaElaboracion || null,
        fechaActualizacion: doc.fechaActualizacion || null, recomendacion: doc.recomendacion || null,
        recordarHora: doc.recordarHora === '' ? null : Number(doc.recordarHora),
        items: items.map((i) => ({
          id: i.id, texto: i.texto, tipo: i.tipo, obligatorio: i.tipo === 'SECCION' ? false : i.obligatorio,
          ...(i.tipo === 'SI_NO' ? { esperado: i.esperado, etiqueta: i.etiqueta, permiteNA: i.permiteNA } : {}),
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
        <Field label="Recomendación de seguridad" hint="Se muestra al llenarlo y sale en el formato impreso">
          {(i) => <Textarea id={i} value={doc.recomendacion} onChange={(e) => setDoc({ ...doc, recomendacion: e.target.value })} maxLength={1000} rows={2} />}
        </Field>
        <div className="form-grid">
          <Field label="Código del formato" hint="Ej. AC-PMT-FR072">{(i) => <Input id={i} value={doc.codigo} onChange={(e) => setDoc({ ...doc, codigo: e.target.value })} maxLength={40} />}</Field>
          <Field label="Versión">{(i) => <Input id={i} value={doc.version} onChange={(e) => setDoc({ ...doc, version: e.target.value })} maxLength={20} />}</Field>
          <Field label="Fecha de elaboración">{(i) => <Input id={i} type="date" value={doc.fechaElaboracion} onChange={(e) => setDoc({ ...doc, fechaElaboracion: e.target.value })} />}</Field>
          <Field label="Fecha de actualización">{(i) => <Input id={i} type="date" value={doc.fechaActualizacion} onChange={(e) => setDoc({ ...doc, fechaActualizacion: e.target.value })} />}</Field>
          <Field label="Se llena todos los días" hint="Si a esa hora no se ha llenado, se avisa al jefe y a mantenimiento">
            {(i) => (
              <Select id={i} value={doc.recordarHora} onChange={(e) => setDoc({ ...doc, recordarHora: e.target.value })}>
                <option value="">No avisar</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>Avisar si a las {String(h).padStart(2, '0')}:00 no se ha llenado</option>)}
              </Select>
            )}
          </Field>
        </div>
        <p className="subtle-head" style={{ marginBottom: 0 }}>Preguntas</p>
        {items.map((it, k) => (
          <div key={k} className={`item-editor ${it.tipo === 'SECCION' ? 'is-section' : ''}`}>
            <div className="item-editor-head">
              <span className="muted">{k + 1}.</span>
              <Input value={it.texto} onChange={(e) => upd(k, { texto: e.target.value })} placeholder={it.tipo === 'SECCION' ? 'Título de la sección (ej. Área de procesos)' : 'Pregunta'} aria-label={`Pregunta ${k + 1}`} required minLength={3} maxLength={300} />
            </div>
            <div className="item-editor-opts">
              <Select value={it.tipo} onChange={(e) => upd(k, { tipo: e.target.value as TipoItem, ...(e.target.value === 'SECCION' ? { obligatorio: false } : {}) })} aria-label="Tipo de respuesta">
                <option value="SI_NO">Sí / No</option>
                <option value="ESCALA">B / R / M / No tiene / NA</option>
                <option value="NUMERO">Número</option>
                <option value="TEXTO">Texto</option>
                <option value="SECCION">Título de sección</option>
              </Select>
              {it.tipo === 'SI_NO' ? (
                <>
                  <Select value={it.etiqueta} onChange={(e) => upd(k, { etiqueta: e.target.value as EtiquetaSiNo })} aria-label="Cómo se muestra">
                    <option value="SI_NO">Sí / No</option><option value="C_NC">Cumple / No cumple</option><option value="BUENO_MALO">Sí-Bueno / No-Malo</option>
                  </Select>
                  <Select value={it.esperado} onChange={(e) => upd(k, { esperado: e.target.value as 'SI' | 'NO' })} aria-label="Respuesta conforme">
                    <option value="SI">Conforme si responde {ETIQUETAS_SI_NO[it.etiqueta].SI}</option><option value="NO">Conforme si responde {ETIQUETAS_SI_NO[it.etiqueta].NO}</option>
                  </Select>
                  <label className="toggle"><input type="checkbox" checked={it.permiteNA} onChange={(e) => upd(k, { permiteNA: e.target.checked })} /> Admite "No aplica"</label>
                </>
              ) : it.tipo === 'NUMERO' ? (
                <>
                  <Input type="number" step="any" value={it.minimo} onChange={(e) => upd(k, { minimo: e.target.value })} placeholder="Mín." aria-label="Mínimo conforme" />
                  <Input type="number" step="any" value={it.maximo} onChange={(e) => upd(k, { maximo: e.target.value })} placeholder="Máx." aria-label="Máximo conforme" />
                </>
              ) : null}
              {it.tipo !== 'SECCION' ? <label className="toggle"><input type="checkbox" checked={it.obligatorio} onChange={(e) => upd(k, { obligatorio: e.target.checked })} /> Obligatoria</label> : null}
              <div className="row-actions">
                <button type="button" className="icon-btn" aria-label="Subir" disabled={k === 0} onClick={() => mover(k, -1)}>↑</button>
                <button type="button" className="icon-btn" aria-label="Bajar" disabled={k === items.length - 1} onClick={() => mover(k, 1)}>↓</button>
                <button type="button" className="icon-btn" aria-label="Quitar pregunta" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== k))}><Icon name="trash" size={18} /></button>
              </div>
            </div>
          </div>
        ))}
        <div className="row-actions">
          <Button type="button" variant="ghost" onClick={() => setItems([...items, nuevoItem(items.at(-1)?.tipo === 'SECCION' ? 'SI_NO' : items.at(-1)?.tipo ?? 'SI_NO')])}><Icon name="plus" /> Agregar pregunta</Button>
          <Button type="button" variant="ghost" onClick={() => setItems([...items, nuevoItem('SECCION')])}><Icon name="plus" /> Agregar sección</Button>
        </div>
        {plantilla ? <label className="toggle"><input type="checkbox" checked={vigente} onChange={(e) => setVigente(e.target.checked)} /> Plantilla vigente</label> : null}
        {plantilla ? <p className="muted small" style={{ margin: 0 }}>Los checklists ya llenados conservan las preguntas con que se respondieron.</p> : null}
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

function RoomTypeModal({ recinto, open, onClose }: { recinto: LightingRoomType | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ nombre: '', minimo: '', promedio: '', maximo: '' });
  useEffect(() => {
    if (!open) return;
    setF(recinto ? { nombre: recinto.nombre, minimo: String(recinto.minimo), promedio: String(recinto.promedio), maximo: String(recinto.maximo) } : { nombre: '', minimo: '', promedio: '', maximo: '' });
  }, [open, recinto]);
  const m = useMutation({
    mutationFn: () => {
      const body = { nombre: f.nombre, minimo: Number(f.minimo), promedio: Number(f.promedio), maximo: Number(f.maximo) };
      return recinto ? api.patch(`/iluminacion/recintos/${recinto.id}`, body) : api.post('/iluminacion/recintos', body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['iluminacion'] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal open={open} title={recinto ? 'Editar tipo de recinto' : 'Nuevo tipo de recinto'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="recinto-form" busy={m.isPending}>Guardar</Button></>}>
      <form id="recinto-form" className="stack" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Tipo de recinto o actividad *" hint="Ej. Industria alimenticia / Áreas generales de trabajo">{(i) => <Input id={i} value={f.nombre} onChange={set('nombre')} required minLength={3} maxLength={150} />}</Field>
        <div className="form-grid">
          <Field label="Mínimo (lux) *">{(i) => <Input id={i} type="number" min="0" value={f.minimo} onChange={set('minimo')} required />}</Field>
          <Field label="Promedio (lux) *">{(i) => <Input id={i} type="number" min="0" value={f.promedio} onChange={set('promedio')} required />}</Field>
          <Field label="Máximo (lux) *">{(i) => <Input id={i} type="number" min="0" value={f.maximo} onChange={set('maximo')} required />}</Field>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Un punto cumple si la media de sus tres mediciones alcanza el mínimo. Las mediciones ya hechas conservan la referencia con que se evaluaron.</p>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

function LightingPointModal({ punto, open, onClose }: { punto: LightingPoint | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const recintos = useQuery({ queryKey: ['iluminacion', 'recintos'], queryFn: () => api.get<LightingRoomType[]>('/iluminacion/recintos'), enabled: open });
  const [f, setF] = useState({ nombre: '', recintoId: '', vigente: true });
  useEffect(() => {
    if (!open) return;
    setF(punto ? { nombre: punto.nombre, recintoId: punto.recintoId, vigente: punto.vigente } : { nombre: '', recintoId: '', vigente: true });
  }, [open, punto]);
  const m = useMutation({
    mutationFn: () => (punto
      ? api.patch(`/iluminacion/puntos/${punto.id}`, { nombre: f.nombre, recintoId: f.recintoId, vigente: f.vigente })
      : api.post('/iluminacion/puntos', { nombre: f.nombre, recintoId: f.recintoId })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['iluminacion'] }); onClose(); },
  });
  return (
    <Modal open={open} title={punto ? 'Editar punto de medición' : 'Nuevo punto de medición'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="pil-form" busy={m.isPending}>Guardar</Button></>}>
      <form id="pil-form" className="stack" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Punto evaluado *" hint="Ej. Sala de desposte">{(i) => <Input id={i} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required minLength={2} maxLength={120} />}</Field>
        <Field label="Tipo de recinto *">
          {(i) => (
            <Select id={i} value={f.recintoId} onChange={(e) => setF({ ...f, recintoId: e.target.value })} required>
              <option value="" disabled>Seleccione…</option>
              {recintos.data?.map((r) => <option key={r.id} value={r.id}>{r.nombre} ({r.minimo}–{r.promedio}–{r.maximo} lux)</option>)}
            </Select>
          )}
        </Field>
        {punto ? <label className="toggle"><input type="checkbox" checked={f.vigente} onChange={(e) => setF({ ...f, vigente: e.target.checked })} /> Punto vigente</label> : null}
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
  const recintos = useQuery({ queryKey: ['iluminacion', 'recintos'], queryFn: () => api.get<LightingRoomType[]>('/iluminacion/recintos') });
  const puntosIl = useQuery({ queryKey: ['iluminacion', 'puntos', 'todos'], queryFn: () => api.get<LightingPoint[]>('/iluminacion/puntos?incluirInactivos=true') });
  const [recinto, setRecinto] = useState<{ open: boolean; item: LightingRoomType | null }>({ open: false, item: null });
  const [pil, setPil] = useState<{ open: boolean; item: LightingPoint | null }>({ open: false, item: null });

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
                    <span className="muted">{[t.area, t.codigo ? `${t.codigo}${t.version ? ` v${t.version}` : ''}` : null, `${t.items.filter((i) => i.tipo !== 'SECCION').length} preguntas`].filter(Boolean).join(' · ')}</span>
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
        <section className="card" id="iluminacion">
          <div className="card-head">
            <h2>Iluminación: tipos de recinto</h2>
            <Button onClick={() => setRecinto({ open: true, item: null })}><Icon name="plus" /> Nuevo tipo</Button>
          </div>
          {recintos.isPending ? <Spinner /> : !recintos.data?.length ? <Empty title="Aún no hay tipos de recinto" /> : (
            <ul className="list">
              {recintos.data.map((r) => (
                <li key={r.id} className="list-row static">
                  <div className="list-main"><strong>{r.nombre}</strong><span className="muted">Mínimo {r.minimo} · promedio {r.promedio} · máximo {r.maximo} lux</span></div>
                  <div className="list-meta"><Button variant="ghost" onClick={() => setRecinto({ open: true, item: r })}>Editar</Button></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Iluminación: puntos de medición</h2>
            <Button onClick={() => setPil({ open: true, item: null })} disabled={!recintos.data?.length}><Icon name="plus" /> Nuevo punto</Button>
          </div>
          {puntosIl.isPending ? <Spinner /> : !puntosIl.data?.length ? <Empty title="Aún no hay puntos de medición" /> : (
            <ul className="list">
              {puntosIl.data.map((p) => (
                <li key={p.id} className={`list-row static ${p.vigente ? '' : 'is-off'}`}>
                  <div className="list-main"><strong>{p.orden}. {p.nombre}</strong><span className="muted">{p.recinto.nombre}</span></div>
                  <div className="list-meta">
                    {!p.vigente ? <Badge tone="muted">Inactivo</Badge> : null}
                    <Button variant="ghost" onClick={() => setPil({ open: true, item: p })}>Editar</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <RoomTypeModal recinto={recinto.item} open={recinto.open} onClose={() => setRecinto({ open: false, item: null })} />
      <LightingPointModal punto={pil.item} open={pil.open} onClose={() => setPil({ open: false, item: null })} />
      <PointModal punto={punto.item} open={punto.open} onClose={() => setPunto({ open: false, item: null })} />
      <TemplateModal plantilla={tpl.item} open={tpl.open} onClose={() => setTpl({ open: false, item: null })} />
    </>
  );
}
