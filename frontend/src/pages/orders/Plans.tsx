import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Asset, EquipmentModel, PersonRef, Plan, UnidadFrecuencia } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PartRow, PartRows, rowsToPayload, useTipoEquipo } from '../../components/orders-shared';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { frecuencia, qty } from '../../format';
import { OrdersTabs } from './OrdersList';

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Destino = 'maquina' | 'tipo';

/** Tipos agrupados por categoría para un <select>. */
export function OpcionesTipos({ tipos }: { tipos: EquipmentModel[] | undefined }) {
  const grupos = useMemo(() => {
    const m = new Map<string, EquipmentModel[]>();
    for (const t of tipos ?? []) m.set(t.categoria.nombre, [...(m.get(t.categoria.nombre) ?? []), t]);
    return [...m];
  }, [tipos]);
  return <>{grupos.map(([cat, ms]) => <optgroup key={cat} label={cat}>{ms.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</optgroup>)}</>;
}

function PlanModal({ plan, equiposDelTipo, open, onClose }: { plan: Plan | null; equiposDelTipo: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = !!plan;
  const activos = useQuery({ queryKey: ['activos', '', '', ''], queryFn: () => api.get<Asset[]>('/activos'), enabled: open });
  const tipos = useQuery({ queryKey: ['tipos-equipo'], queryFn: () => api.get<EquipmentModel[]>('/tipos-equipo'), enabled: open });
  const tecnicos = useQuery({ queryKey: ['tecnicos'], queryFn: () => api.get<PersonRef[]>('/usuarios/tecnicos'), enabled: open });
  const [destino, setDestino] = useState<Destino>('maquina');
  const [f, setF] = useState({ activoId: '', modeloId: '', nombre: '', tareas: '', frecuenciaValor: '1', frecuenciaUnidad: 'MESES' as UnidadFrecuencia, diasAviso: '7', tecnicoId: '', primeraFecha: hoyLocal(), vigente: true });
  const [rows, setRows] = useState<PartRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setDestino(plan?.modeloId ? 'tipo' : 'maquina');
    setF(plan
      ? { activoId: plan.activoId ?? '', modeloId: plan.modeloId ?? '', nombre: plan.nombre, tareas: plan.tareas ?? '', frecuenciaValor: String(plan.frecuenciaValor), frecuenciaUnidad: plan.frecuenciaUnidad, diasAviso: String(plan.diasAviso), tecnicoId: plan.tecnicoId ?? '', primeraFecha: hoyLocal(), vigente: plan.vigente }
      : { activoId: '', modeloId: '', nombre: '', tareas: '', frecuenciaValor: '1', frecuenciaUnidad: 'MESES', diasAviso: '7', tecnicoId: '', primeraFecha: hoyLocal(), vigente: true });
    setRows(plan ? plan.repuestos.map((r) => ({ repuestoId: r.repuestoId, cantidad: String(r.cantidad) })) : []);
  }, [open, plan]);

  // Tipo de equipo del destino: su lista de materiales es la base del kit del plan.
  const activo = activos.data?.find((a) => a.id === f.activoId);
  const modeloId = destino === 'tipo' ? f.modeloId : activo?.modeloId ?? null;
  const tipo = useTipoEquipo(modeloId);
  const materiales = tipo.data?.materiales ?? [];
  const [precargado, setPrecargado] = useState<string | null>(null);
  useEffect(() => {
    // Al elegir la máquina o el tipo, el kit vacío se llena con la lista de materiales (se puede ajustar).
    if (editing || !tipo.data || precargado === tipo.data.id) return;
    setPrecargado(tipo.data.id);
    if (rows.every((r) => !r.repuestoId)) setRows(tipo.data.materiales.map((m) => ({ repuestoId: m.repuestoId, cantidad: String(m.cantidad) })));
  }, [tipo.data, editing, precargado, rows]);
  useEffect(() => { if (!open) setPrecargado(null); }, [open]);

  const equiposTipo = destino === 'tipo' && f.modeloId ? activos.data?.filter((a) => a.modeloId === f.modeloId && a.estado !== 'DADO_DE_BAJA' && a.estado !== 'EN_BODEGA').length ?? 0 : 0;

  const m = useMutation({
    mutationFn: () => {
      const comunes = {
        nombre: f.nombre, tareas: f.tareas || (editing ? null : undefined), frecuenciaValor: Number(f.frecuenciaValor),
        frecuenciaUnidad: f.frecuenciaUnidad, diasAviso: Number(f.diasAviso), tecnicoId: f.tecnicoId || null, repuestos: rowsToPayload(rows),
      };
      if (editing) return api.patch(`/planes/${plan!.id}`, { ...comunes, vigente: f.vigente });
      const destinoBody = destino === 'tipo' ? { modeloId: f.modeloId } : { activoId: f.activoId };
      return api.post('/planes', { ...comunes, ...destinoBody, primeraFecha: f.primeraFecha, tecnicoId: f.tecnicoId || undefined });
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
  const cambiarDestino = (d: Destino) => { setDestino(d); setRows([]); setPrecargado(null); };

  return (
    <Modal open={open} title={editing ? (plan?.modeloId ? 'Editar plan del tipo de equipo' : 'Editar plan preventivo') : 'Nuevo plan preventivo'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="plan-form" busy={m.isPending}>{editing ? 'Guardar' : 'Crear plan'}</Button></>}>
      <form id="plan-form" className="stack" onSubmit={submit}>
        {!editing ? (
          <div className="seg" role="radiogroup" aria-label="El plan se aplica a">
            <button type="button" role="radio" aria-checked={destino === 'maquina'} className={`seg-btn ${destino === 'maquina' ? 'on' : ''}`} onClick={() => cambiarDestino('maquina')}>Una máquina</button>
            <button type="button" role="radio" aria-checked={destino === 'tipo'} className={`seg-btn ${destino === 'tipo' ? 'on' : ''}`} onClick={() => cambiarDestino('tipo')}>Todos los de un tipo</button>
          </div>
        ) : null}
        {destino === 'maquina' ? (
          <Field label="Máquina *">
            {(i) => (
              <Select id={i} value={f.activoId} onChange={set('activoId')} required disabled={editing}>
                <option value="" disabled>Seleccione…</option>
                {activos.data?.filter((a) => a.estado !== 'DADO_DE_BAJA' && a.estado !== 'EN_BODEGA').map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
              </Select>
            )}
          </Field>
        ) : (
          <Field label="Tipo de equipo *" hint={editing ? `Los cambios se aplican a los ${equiposDelTipo} equipos de este tipo.` : f.modeloId ? `Se crea el plan de los ${equiposTipo} equipos de este tipo (sin los dados de baja) y de los que se registren después.` : 'Ej. todos los aires acondicionados mini split 12.000 BTU.'}>
            {(i) => (
              <Select id={i} value={f.modeloId} onChange={set('modeloId')} required disabled={editing}>
                <option value="" disabled>Seleccione…</option>
                <OpcionesTipos tipos={tipos.data} />
              </Select>
            )}
          </Field>
        )}
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
          <p className="subtle-head">Materiales por ejecución</p>
          <PartRows rows={rows} onChange={setRows} sugeridos={materiales} tituloSugeridos={tipo.data ? `Lista de materiales · ${tipo.data.nombre}` : undefined} />
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
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const q = useQuery({ queryKey: ['planes'], queryFn: () => api.get<Plan[]>('/planes') });

  const hijos = useMemo(() => {
    const m = new Map<string, Plan[]>();
    for (const p of q.data ?? []) if (p.plantillaId) m.set(p.plantillaId, [...(m.get(p.plantillaId) ?? []), p]);
    return m;
  }, [q.data]);
  // Los planes de cada equipo creados desde un plan por tipo se muestran dentro de ese plan.
  const visibles = (q.data ?? []).filter((p) => !p.plantillaId);
  const toggle = (id: string) => setAbiertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const kit = (p: Plan) => (p.repuestos.length ? <span className="muted small">Materiales: {p.repuestos.map((r) => `${r.repuesto.codigo} × ${qty(r.cantidad)}`).join(', ')}</span> : null);

  return (
    <>
      <PageHeader
        title="Mantenimiento"
        actions={can('ADMIN') ? <Button onClick={() => { setEdit(null); setOpen(true); }}><Icon name="plus" /> Nuevo plan</Button> : null}
      />
      <OrdersTabs />
      <p className="muted" style={{ marginTop: 0 }}>Cada plan genera una orden preventiva; al cerrarla se programa la siguiente automáticamente. Un plan por tipo de equipo se aplica a todos los equipos iguales.</p>
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : visibles.length === 0 ? (
        <Empty title="Aún no hay planes preventivos">
          {can('ADMIN') ? <Button onClick={() => { setEdit(null); setOpen(true); }}>Crear el primero</Button> : null}
        </Empty>
      ) : (
        <ul className="list">
          {visibles.map((p) => {
            const deTipo = !!p.modeloId;
            const equipos = hijos.get(p.id) ?? [];
            return (
              <li key={p.id} className={`list-row static ${p.vigente ? '' : 'is-off'}`}>
                <div className="list-main">
                  {deTipo ? <span className="code">Tipo · {p.modeloEquipo?.categoria.nombre}</span> : <span className="code">{p.activo?.codigo}</span>}
                  <strong>{p.nombre}</strong>
                  <span className="muted">
                    {deTipo ? <>{p.modeloEquipo?.nombre} · {equipos.length} equipo{equipos.length === 1 ? '' : 's'}</> : <Link to={`/maquinas/${p.activo?.id}`}>{p.activo?.nombre}</Link>}
                    {' · '}{frecuencia(p.frecuenciaValor, p.frecuenciaUnidad)} · {p.tecnico?.nombre ?? 'Sin técnico'}
                  </span>
                  {kit(p)}
                  {deTipo && equipos.length ? (
                    <>
                      <button type="button" className="link-btn" aria-expanded={abiertos.has(p.id)} onClick={() => toggle(p.id)}>
                        {abiertos.has(p.id) ? 'Ocultar equipos' : `Ver los ${equipos.length} equipos`}
                      </button>
                      {abiertos.has(p.id) ? (
                        <ul className="plan-equipos">
                          {equipos.map((h) => (
                            <li key={h.id}><Link to={`/maquinas/${h.activo?.id}`}><strong>{h.activo?.codigo}</strong> {h.activo?.nombre}</Link> <span className="muted">· {h.activo?.area}</span></li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="list-meta">
                  {deTipo ? <Badge tone="info">Por tipo</Badge> : null}
                  {!p.vigente ? <Badge tone="muted">Inactivo</Badge> : <Badge tone="ok">Vigente</Badge>}
                  {can('ADMIN') ? <Button variant="ghost" onClick={() => { setEdit(p); setOpen(true); }}>Editar</Button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PlanModal plan={edit} equiposDelTipo={edit ? (hijos.get(edit.id)?.length ?? 0) : 0} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
