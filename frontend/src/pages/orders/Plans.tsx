import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Asset, PersonRef, Plan, UnidadFrecuencia } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PartRow, PartRows, rowsToPayload } from '../../components/orders-shared';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { frecuencia, qty } from '../../format';
import { OrdersTabs } from './OrdersList';

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function PlanModal({ plan, open, onClose }: { plan: Plan | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = !!plan;
  const activos = useQuery({ queryKey: ['activos', '', '', ''], queryFn: () => api.get<Asset[]>('/activos'), enabled: open });
  const tecnicos = useQuery({ queryKey: ['tecnicos'], queryFn: () => api.get<PersonRef[]>('/usuarios/tecnicos'), enabled: open });
  const [f, setF] = useState({ activoId: '', nombre: '', tareas: '', frecuenciaValor: '1', frecuenciaUnidad: 'MESES' as UnidadFrecuencia, diasAviso: '7', tecnicoId: '', primeraFecha: hoyLocal(), vigente: true });
  const [rows, setRows] = useState<PartRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setF(plan
      ? { activoId: plan.activoId, nombre: plan.nombre, tareas: plan.tareas ?? '', frecuenciaValor: String(plan.frecuenciaValor), frecuenciaUnidad: plan.frecuenciaUnidad, diasAviso: String(plan.diasAviso), tecnicoId: plan.tecnicoId ?? '', primeraFecha: hoyLocal(), vigente: plan.vigente }
      : { activoId: '', nombre: '', tareas: '', frecuenciaValor: '1', frecuenciaUnidad: 'MESES', diasAviso: '7', tecnicoId: '', primeraFecha: hoyLocal(), vigente: true });
    setRows(plan ? plan.repuestos.map((r) => ({ repuestoId: r.repuestoId, cantidad: String(r.cantidad) })) : []);
  }, [open, plan]);

  const m = useMutation({
    mutationFn: () => {
      const comunes = {
        nombre: f.nombre, tareas: f.tareas || (editing ? null : undefined), frecuenciaValor: Number(f.frecuenciaValor),
        frecuenciaUnidad: f.frecuenciaUnidad, diasAviso: Number(f.diasAviso), tecnicoId: f.tecnicoId || null, repuestos: rowsToPayload(rows),
      };
      return editing
        ? api.patch(`/planes/${plan!.id}`, { ...comunes, vigente: f.vigente })
        : api.post('/planes', { ...comunes, activoId: f.activoId, primeraFecha: f.primeraFecha, tecnicoId: f.tecnicoId || undefined });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planes'] });
      qc.invalidateQueries({ queryKey: ['ordenes'] });
      qc.invalidateQueries({ queryKey: ['ordenes-resumen'] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <Modal open={open} title={editing ? 'Editar plan preventivo' : 'Nuevo plan preventivo'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="plan-form" busy={m.isPending}>{editing ? 'Guardar' : 'Crear plan'}</Button></>}>
      <form id="plan-form" className="stack" onSubmit={submit}>
        <Field label="Máquina *">
          {(i) => (
            <Select id={i} value={f.activoId} onChange={set('activoId')} required disabled={editing}>
              <option value="" disabled>Seleccione…</option>
              {activos.data?.filter((a) => a.estado !== 'DADO_DE_BAJA').map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Nombre *" hint="Ej. Lubricación mensual">{(i) => <Input id={i} value={f.nombre} onChange={set('nombre')} required minLength={3} maxLength={150} />}</Field>
        <Field label="Tareas">{(i) => <Textarea id={i} value={f.tareas} onChange={set('tareas')} maxLength={4000} />}</Field>
        <div className="form-grid">
          <Field label="Cada *">{(i) => <Input id={i} type="number" min="1" max="365" value={f.frecuenciaValor} onChange={set('frecuenciaValor')} required />}</Field>
          <Field label="Unidad *">
            {(i) => (
              <Select id={i} value={f.frecuenciaUnidad} onChange={set('frecuenciaUnidad')}>
                <option value="DIAS">Días</option><option value="SEMANAS">Semanas</option><option value="MESES">Meses</option>
              </Select>
            )}
          </Field>
          <Field label="Avisar con (días)">{(i) => <Input id={i} type="number" min="0" max="90" value={f.diasAviso} onChange={set('diasAviso')} />}</Field>
          {!editing ? <Field label="Primer mantenimiento *">{(i) => <Input id={i} type="date" value={f.primeraFecha} onChange={set('primeraFecha')} required />}</Field> : null}
          <Field label="Técnico responsable">
            {(i) => (
              <Select id={i} value={f.tecnicoId} onChange={set('tecnicoId')}>
                <option value="">Sin asignar</option>
                {tecnicos.data?.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {editing ? (
          <label className="toggle"><input type="checkbox" checked={f.vigente} onChange={(e) => setF((s) => ({ ...s, vigente: e.target.checked }))} /> Plan vigente (si se desactiva, no genera más órdenes)</label>
        ) : null}
        <div>
          <p className="subtle-head">Kit de repuestos por ejecución</p>
          <PartRows rows={rows} onChange={setRows} />
        </div>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

export function Plans() {
  const { can } = useAuth();
  const [edit, setEdit] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['planes'], queryFn: () => api.get<Plan[]>('/planes') });

  return (
    <>
      <PageHeader
        title="Mantenimiento"
        actions={can('ADMIN') ? <Button onClick={() => { setEdit(null); setOpen(true); }}><Icon name="plus" /> Nuevo plan</Button> : null}
      />
      <OrdersTabs />
      <p className="muted" style={{ marginTop: 0 }}>Cada plan genera una orden preventiva; al cerrarla se programa la siguiente automáticamente.</p>
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? (
        <Empty title="Aún no hay planes preventivos">
          {can('ADMIN') ? <Button onClick={() => { setEdit(null); setOpen(true); }}>Crear el primero</Button> : null}
        </Empty>
      ) : (
        <ul className="list">
          {q.data.map((p) => (
            <li key={p.id} className={`list-row static ${p.vigente ? '' : 'is-off'}`}>
              <div className="list-main">
                <span className="code">{p.activo.codigo}</span>
                <strong>{p.nombre}</strong>
                <span className="muted">
                  <Link to={`/maquinas/${p.activo.id}`}>{p.activo.nombre}</Link> · {frecuencia(p.frecuenciaValor, p.frecuenciaUnidad)} · {p.tecnico?.nombre ?? 'Sin técnico'}
                </span>
                {p.repuestos.length ? <span className="muted small">Kit: {p.repuestos.map((r) => `${r.repuesto.codigo} × ${qty(r.cantidad)}`).join(', ')}</span> : null}
              </div>
              <div className="list-meta">
                {!p.vigente ? <Badge tone="muted">Inactivo</Badge> : <Badge tone="ok">Vigente</Badge>}
                {can('ADMIN') ? <Button variant="ghost" onClick={() => { setEdit(p); setOpen(true); }}>Editar</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <PlanModal plan={edit} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
