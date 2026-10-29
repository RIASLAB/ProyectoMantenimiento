import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { EquipmentModel } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PartRow, PartRows, rowsToPayload } from '../../components/orders-shared';
import { Button, Empty, ErrorBox, Field, Icon, Input, Modal, PageHeader, Spinner, Textarea } from '../../components/ui';
import { qty } from '../../format';
import { AssetsTabs } from './AssetsList';

/** Crear o editar un tipo de equipo (categoría + modelo) con su lista de materiales. */
export function TipoModal({ tipo, open, onClose }: { tipo: EquipmentModel | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const categorias = useQuery({ queryKey: ['tipos-equipo', 'categorias'], queryFn: () => api.get<Array<{ id: string; nombre: string }>>('/tipos-equipo/categorias'), enabled: open });
  const [f, setF] = useState({ categoria: '', nombre: '', fabricante: '', referencia: '', descripcion: '' });
  const [rows, setRows] = useState<PartRow[]>([]);
  useEffect(() => {
    if (!open) return;
    setF(tipo
      ? { categoria: tipo.categoria.nombre, nombre: tipo.nombre, fabricante: tipo.fabricante ?? '', referencia: tipo.referencia ?? '', descripcion: tipo.descripcion ?? '' }
      : { categoria: '', nombre: '', fabricante: '', referencia: '', descripcion: '' });
    setRows(tipo ? tipo.materiales.map((m) => ({ repuestoId: m.repuestoId, cantidad: String(m.cantidad) })) : []);
  }, [open, tipo]);
  const m = useMutation({
    mutationFn: () => {
      const body = { ...f, fabricante: f.fabricante || null, referencia: f.referencia || null, descripcion: f.descripcion || null, materiales: rowsToPayload(rows) };
      return tipo ? api.patch(`/tipos-equipo/${tipo.id}`, body) : api.post('/tipos-equipo', body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tipos-equipo'] }); qc.invalidateQueries({ queryKey: ['tipo-equipo'] }); qc.invalidateQueries({ queryKey: ['activo'] }); qc.invalidateQueries({ queryKey: ['bitacora'] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <Modal open={open} title={tipo ? 'Editar tipo de equipo' : 'Nuevo tipo de equipo'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="tipo-form" busy={m.isPending}>{tipo ? 'Guardar' : 'Crear tipo'}</Button></>}>
      <form id="tipo-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Categoría *" hint="Ej. Aire acondicionado. Escriba una nueva o elija una existente.">
            {(i) => (
              <>
                <Input id={i} value={f.categoria} onChange={set('categoria')} required minLength={2} maxLength={100} list="categorias-list" />
                <datalist id="categorias-list">{categorias.data?.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
              </>
            )}
          </Field>
          <Field label="Modelo *" hint="Ej. Mini split 12.000 BTU">{(i) => <Input id={i} value={f.nombre} onChange={set('nombre')} required minLength={2} maxLength={120} />}</Field>
          <Field label="Fabricante">{(i) => <Input id={i} value={f.fabricante} onChange={set('fabricante')} maxLength={100} />}</Field>
          <Field label="Referencia del fabricante">{(i) => <Input id={i} value={f.referencia} onChange={set('referencia')} maxLength={100} />}</Field>
          <Field label="Descripción" full>{(i) => <Textarea id={i} value={f.descripcion} onChange={set('descripcion')} maxLength={2000} rows={2} />}</Field>
        </div>
        <div>
          <p className="subtle-head">Lista de materiales</p>
          <p className="muted small" style={{ marginTop: 0 }}>Repuestos e insumos que usa este equipo y la cantidad de un mantenimiento. Se cargan solos en sus preventivos y se ofrecen al planificar o cerrar un correctivo.</p>
          <PartRows rows={rows} onChange={setRows} showStock={false} />
        </div>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

/** Tipos de equipo agrupados por categoría, con su lista de materiales y cuántos equipos hay de cada uno. */
export function EquipmentTypes() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tipos-equipo'], queryFn: () => api.get<EquipmentModel[]>('/tipos-equipo') });
  const [edit, setEdit] = useState<EquipmentModel | null>(null);
  const [open, setOpen] = useState(false);
  const [aBorrar, setABorrar] = useState<EquipmentModel | null>(null);
  const borrar = useMutation({
    mutationFn: (id: string) => api.delete(`/tipos-equipo/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tipos-equipo'] }); setABorrar(null); },
  });
  const grupos = useMemo(() => {
    const m = new Map<string, EquipmentModel[]>();
    for (const t of q.data ?? []) m.set(t.categoria.nombre, [...(m.get(t.categoria.nombre) ?? []), t]);
    return [...m];
  }, [q.data]);
  const nuevo = () => { setEdit(null); setOpen(true); };

  return (
    <>
      <PageHeader title="Máquinas" subtitle="Equipos iguales comparten su lista de materiales y sus preventivos"
        actions={can('ADMIN') ? <Button onClick={nuevo}><Icon name="plus" /> Nuevo tipo</Button> : null} />
      <AssetsTabs />
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : grupos.length === 0 ? (
        <Empty title="Aún no hay tipos de equipo">
          <p className="muted">Ej. categoría "Aire acondicionado", modelo "Mini split 12.000 BTU", con los filtros y el gas que usa en cada mantenimiento.</p>
          {can('ADMIN') ? <Button onClick={nuevo}>Crear el primero</Button> : null}
        </Empty>
      ) : (
        <div className="stack-lg">
          {grupos.map(([cat, modelos]) => (
            <section key={cat}>
              <h2 className="group-title">{cat} <span className="muted">· {modelos.reduce((s, m) => s + (m.equipos as number), 0)} equipos</span></h2>
              <ul className="list">
                {modelos.map((t) => (
                  <li key={t.id} className="list-row static tipo-row">
                    <div className="list-main">
                      <strong>{t.nombre}</strong>
                      <span className="muted">{[t.fabricante, t.referencia].filter(Boolean).join(' · ') || 'Sin fabricante'}</span>
                      {t.materiales.length ? (
                        <span className="small">Materiales: {t.materiales.map((m) => `${m.repuesto.codigo} × ${qty(m.cantidad)} ${m.repuesto.unidad}`).join(', ')}</span>
                      ) : <span className="small text-warn">Sin lista de materiales</span>}
                    </div>
                    <div className="list-meta">
                      <Link to={`/maquinas?modeloId=${t.id}`} className="btn btn-ghost">{t.equipos as number} equipo{t.equipos === 1 ? '' : 's'}</Link>
                      {can('ADMIN') ? (
                        <>
                          <Button variant="ghost" onClick={() => { setEdit(t); setOpen(true); }}>Editar</Button>
                          {t.equipos === 0 ? (
                            <button type="button" className="icon-btn" aria-label={`Eliminar ${t.nombre}`} onClick={() => setABorrar(t)}><Icon name="trash" /></button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <TipoModal tipo={edit} open={open} onClose={() => setOpen(false)} />
      <Modal open={!!aBorrar} title="Eliminar tipo de equipo" onClose={() => { setABorrar(null); borrar.reset(); }}
        footer={<><Button variant="ghost" onClick={() => { setABorrar(null); borrar.reset(); }}>Cancelar</Button><Button variant="danger" busy={borrar.isPending} onClick={() => aBorrar && borrar.mutate(aBorrar.id)}>Eliminar</Button></>}>
        <p style={{ marginTop: 0 }}>¿Eliminar <strong>{aBorrar?.nombre}</strong>? No tiene equipos asignados.</p>
        {borrar.isError ? <ErrorBox error={borrar.error} /> : null}
      </Modal>
    </>
  );
}
