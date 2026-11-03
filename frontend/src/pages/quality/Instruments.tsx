import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, openProtectedFile } from '../../api/client';
import type { EstadoCalibracion, InstrumentDetail, InstrumentInfo, TipoInstrumento } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, KeyValue, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { date } from '../../format';
import { useUrlFilters } from '../../hooks';

export const TIPO_INSTRUMENTO: Record<TipoInstrumento, string> = {
  TERMOMETRO: 'Termómetro', LUXOMETRO: 'Luxómetro', BASCULA: 'Báscula', MANOMETRO: 'Manómetro', MULTIMETRO: 'Multímetro / pinza', OTRO: 'Otro',
};
export const ESTADO_CAL: Record<EstadoCalibracion, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  VIGENTE: { label: 'Calibración vigente', tone: 'ok' },
  POR_VENCER: { label: 'Por vencer', tone: 'warn' },
  VENCIDA: { label: 'Vencida', tone: 'bad' },
  NO_APTO: { label: 'No apto', tone: 'bad' },
  SIN_CALIBRAR: { label: 'Sin calibración', tone: 'muted' },
};

const VACIO = { codigo: '', nombre: '', tipo: 'TERMOMETRO' as TipoInstrumento, marca: '', modelo: '', serie: '', area: '', ubicacion: '', rango: '', frecuenciaMeses: '12', vigente: true };

function InstrumentModal({ inst, open, onClose }: { inst: InstrumentInfo | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<string[]>('/activos/areas'), enabled: open });
  const [f, setF] = useState(VACIO);
  useEffect(() => {
    if (!open) return;
    setF(inst ? {
      codigo: inst.codigo, nombre: inst.nombre, tipo: inst.tipo, marca: inst.marca ?? '', modelo: inst.modelo ?? '', serie: inst.serie ?? '',
      area: inst.area, ubicacion: inst.ubicacion ?? '', rango: inst.rango ?? '', frecuenciaMeses: String(inst.frecuenciaMeses), vigente: inst.vigente,
    } : VACIO);
  }, [open, inst]);
  const m = useMutation({
    mutationFn: () => {
      const body = { ...f, frecuenciaMeses: Number(f.frecuenciaMeses) };
      return inst ? api.patch(`/instrumentos/${inst.id}`, body) : api.post('/instrumentos', { ...body, vigente: undefined });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['instrumentos'] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal open={open} title={inst ? `Editar ${inst.codigo}` : 'Nuevo instrumento'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="inst-form" busy={m.isPending}>Guardar</Button></>}>
      <form id="inst-form" className="stack" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="form-grid">
          <Field label="Código *" hint="Ej. TER-001">{(i) => <Input id={i} value={f.codigo} onChange={set('codigo')} required pattern="[A-Za-z0-9._\/\-]{2,40}" />}</Field>
          <Field label="Tipo *">
            {(i) => <Select id={i} value={f.tipo} onChange={set('tipo')}>{(Object.keys(TIPO_INSTRUMENTO) as TipoInstrumento[]).map((t) => <option key={t} value={t}>{TIPO_INSTRUMENTO[t]}</option>)}</Select>}
          </Field>
          <Field label="Nombre *" full hint="Ej. Termómetro de punzón de la sala de desposte">{(i) => <Input id={i} value={f.nombre} onChange={set('nombre')} required minLength={2} maxLength={150} />}</Field>
          <Field label="Marca">{(i) => <Input id={i} value={f.marca} onChange={set('marca')} maxLength={100} />}</Field>
          <Field label="Modelo">{(i) => <Input id={i} value={f.modelo} onChange={set('modelo')} maxLength={100} />}</Field>
          <Field label="N.º de serie">{(i) => <Input id={i} value={f.serie} onChange={set('serie')} maxLength={100} />}</Field>
          <Field label="Rango y resolución" hint="Ej. -50 a 150 °C, 0,1 °C">{(i) => <Input id={i} value={f.rango} onChange={set('rango')} maxLength={120} />}</Field>
          <Field label="Área *">
            {(i) => (<><Input id={i} value={f.area} onChange={set('area')} required minLength={2} maxLength={100} list="areas-inst" />
              <datalist id="areas-inst">{areas.data?.map((a) => <option key={a} value={a} />)}</datalist></>)}
          </Field>
          <Field label="Ubicación">{(i) => <Input id={i} value={f.ubicacion} onChange={set('ubicacion')} maxLength={150} />}</Field>
          <Field label="Calibrar cada (meses) *">{(i) => <Input id={i} type="number" min="1" max="60" value={f.frecuenciaMeses} onChange={set('frecuenciaMeses')} required />}</Field>
        </div>
        {inst ? <label className="toggle"><input type="checkbox" checked={f.vigente} onChange={(e) => setF({ ...f, vigente: e.target.checked })} /> En uso</label> : null}
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

/** Instrumentos de medición con el estado de su calibración (por vencer y vencidos primero). */
export function InstrumentsList() {
  const { can } = useAuth();
  const [f, set] = useUrlFilters(['estado'] as const);
  const q = useQuery({ queryKey: ['instrumentos'], queryFn: () => api.get<InstrumentInfo[]>('/instrumentos') });
  const [edit, setEdit] = useState<{ open: boolean; item: InstrumentInfo | null }>({ open: false, item: null });
  const orden: EstadoCalibracion[] = ['VENCIDA', 'NO_APTO', 'POR_VENCER', 'SIN_CALIBRAR', 'VIGENTE'];
  const lista = (q.data ?? []).filter((i) => i.vigente && (!f.estado || i.estado === f.estado)).sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado));
  const cuenta = (e: EstadoCalibracion) => (q.data ?? []).filter((i) => i.vigente && i.estado === e).length;
  return (
    <>
      <PageHeader back={<Link to="/calidad" className="back-link"><Icon name="back" size={18} /> Calidad</Link>} title="Calibración de instrumentos"
        subtitle="Termómetros, luxómetro, básculas y demás instrumentos de medición"
        actions={can('ADMIN') ? <Button onClick={() => setEdit({ open: true, item: null })}><Icon name="plus" /> Nuevo instrumento</Button> : null} />
      <div className="chips">
        {(['VENCIDA', 'NO_APTO', 'POR_VENCER', 'SIN_CALIBRAR', 'VIGENTE'] as EstadoCalibracion[]).map((e) => (
          <button key={e} type="button" className={`chip ${f.estado === e ? 'chip-on' : ''} ${ESTADO_CAL[e].tone === 'bad' && cuenta(e) ? 'chip-bad' : ESTADO_CAL[e].tone === 'warn' && cuenta(e) ? 'chip-warn' : ''}`}
            onClick={() => set('estado', f.estado === e ? '' : e)}><strong>{cuenta(e)}</strong> {ESTADO_CAL[e].label.toLowerCase()}</button>
        ))}
      </div>
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} /> : !lista.length ? (
        <Empty title={q.data.length ? 'Ningún instrumento con este filtro' : 'Aún no hay instrumentos registrados'} />
      ) : (
        <ul className="list">
          {lista.map((i) => (
            <li key={i.id}>
              <Link to={`/calidad/instrumentos/${i.id}`} className="list-row">
                <div className="list-main">
                  <strong>{i.codigo} · {i.nombre}</strong>
                  <span className="muted">{TIPO_INSTRUMENTO[i.tipo]} · {[i.area, i.ubicacion].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="list-meta">
                  <Badge tone={ESTADO_CAL[i.estado].tone}>{ESTADO_CAL[i.estado].label}</Badge>
                  <span className="muted small">{i.ultima ? `Vence ${date(i.ultima.venceEn)}` : `Cada ${i.frecuenciaMeses} meses`}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <InstrumentModal inst={edit.item} open={edit.open} onClose={() => setEdit({ open: false, item: null })} />
    </>
  );
}

function CalibrationModal({ inst, open, onClose }: { inst: InstrumentDetail; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [f, setF] = useState({ fecha: hoy, venceEn: '', laboratorio: '', numeroCertificado: '', resultado: 'APTO', observaciones: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  useEffect(() => { if (open) { setF({ fecha: hoy, venceEn: '', laboratorio: inst.calibraciones[0]?.laboratorio ?? '', numeroCertificado: '', resultado: 'APTO', observaciones: '' }); setArchivo(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(f)) if (v) fd.append(k, v);
      if (archivo) fd.append('archivo', archivo);
      return api.post(`/instrumentos/${inst.id}/calibraciones`, fd);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['instrumentos'] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal open={open} title={`Registrar calibración · ${inst.codigo}`} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="cal-form" busy={m.isPending}>Guardar</Button></>}>
      <form id="cal-form" className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
        <div className="form-grid">
          <Field label="Fecha de calibración *">{(i) => <Input id={i} type="date" value={f.fecha} max={hoy} onChange={set('fecha')} required />}</Field>
          <Field label="Vence el" hint={`Vacío = en ${inst.frecuenciaMeses} meses`}>{(i) => <Input id={i} type="date" value={f.venceEn} min={f.fecha} onChange={set('venceEn')} />}</Field>
          <Field label="Laboratorio *">{(i) => <Input id={i} value={f.laboratorio} onChange={set('laboratorio')} required minLength={2} maxLength={150} />}</Field>
          <Field label="N.º de certificado">{(i) => <Input id={i} value={f.numeroCertificado} onChange={set('numeroCertificado')} maxLength={80} />}</Field>
          <Field label="Resultado *">
            {(i) => <Select id={i} value={f.resultado} onChange={set('resultado')}><option value="APTO">Apto para uso</option><option value="NO_APTO">No apto</option></Select>}
          </Field>
          <Field label="Certificado (PDF o foto)">{(i) => <input id={i} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />}</Field>
        </div>
        <Field label={f.resultado === 'NO_APTO' ? 'Observaciones * (qué se hará: ajuste, cambio, retiro)' : 'Observaciones'} hint="Ej. error encontrado y corrección aplicada">
          {(i) => <Textarea id={i} value={f.observaciones} onChange={set('observaciones')} maxLength={2000} required={f.resultado === 'NO_APTO'} minLength={f.resultado === 'NO_APTO' ? 5 : undefined} />}
        </Field>
        <p className="muted small" style={{ margin: 0 }}>La calibración queda registrada y no se puede modificar.</p>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

export function InstrumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['instrumentos', id], queryFn: () => api.get<InstrumentDetail>(`/instrumentos/${id}`) });
  const [cal, setCal] = useState(false);
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState('');
  const back = <Link to="/calidad/instrumentos" className="back-link"><Icon name="back" size={18} /> Instrumentos</Link>;
  if (q.isPending) return <Spinner />;
  if (q.isError) return <>{back}<ErrorBox error={q.error} /></>;
  const i = q.data;
  const ultima = i.calibraciones[0];
  return (
    <>
      <PageHeader back={back} title={`${i.codigo} · ${i.nombre}`} subtitle={<Badge tone={ESTADO_CAL[i.estado].tone}>{ESTADO_CAL[i.estado].label}{ultima ? ` · vence ${date(ultima.venceEn)}` : ''}</Badge>}
        actions={<>
          {can('ADMIN', 'TECNICO') ? <Button onClick={() => setCal(true)}><Icon name="check" /> Registrar calibración</Button> : null}
          {can('ADMIN') ? <Button variant="secondary" onClick={() => setEdit(true)}><Icon name="edit" /> Editar</Button> : null}
        </>} />
      <div className="grid-2">
        <section className="card">
          <h2>Ficha</h2>
          <KeyValue items={[
            ['Tipo', TIPO_INSTRUMENTO[i.tipo]], ['Marca', i.marca], ['Modelo', i.modelo], ['N.º de serie', i.serie], ['Rango', i.rango],
            ['Área', i.area], ['Ubicación', i.ubicacion], ['Calibrar cada', `${i.frecuenciaMeses} meses`], ...(!i.vigente ? [['Estado', 'Fuera de uso'] as [string, string]] : []),
          ]} />
        </section>
        <section className="card">
          <h2>Calibraciones</h2>
          {err ? <div className="alert alert-bad">{err}</div> : null}
          {!i.calibraciones.length ? <Empty title="Aún no tiene calibraciones registradas" /> : (
            <ul className="list">
              {i.calibraciones.map((c) => (
                <li key={c.id} className="list-row static">
                  <div className="list-main">
                    <strong>{date(c.fecha)} · {c.laboratorio}</strong>
                    <span className="muted">{c.numeroCertificado ? `Certificado ${c.numeroCertificado} · ` : ''}vence {date(c.venceEn)} · {c.usuario.nombre}</span>
                    {c.observaciones ? <span className="small">{c.observaciones}</span> : null}
                  </div>
                  <div className="list-meta">
                    <Badge tone={c.resultado === 'APTO' ? 'ok' : 'bad'}>{c.resultado === 'APTO' ? 'Apto' : 'No apto'}</Badge>
                    {c.archivoNombre ? (
                      <Button variant="ghost" onClick={() => { setErr(''); openProtectedFile(`/instrumentos/calibraciones/${c.id}/certificado`, c.archivoNombre!).catch((e) => setErr(e.message)); }}>
                        <Icon name="file" /> Certificado
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <CalibrationModal inst={i} open={cal} onClose={() => setCal(false)} />
      <InstrumentModal inst={i} open={edit} onClose={() => setEdit(false)} />
    </>
  );
}
