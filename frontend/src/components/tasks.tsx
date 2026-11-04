import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import type { MaintenanceTask } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBox, Field, Icon, Input, Modal, Spinner, Textarea } from './ui';

/** Catálogo de tareas activas (D-31); `todas` incluye las desactivadas. */
export function useTareas(todas = false) {
  return useQuery({
    queryKey: ['tareas-mantenimiento', todas ? 'todas' : 'activas'],
    queryFn: () => api.get<MaintenanceTask[]>(`/tareas-mantenimiento${todas ? '?todas=1' : ''}`),
  });
}

/** Tareas agrupadas por su grupo (las sin grupo al final, en "Otras"). */
export function agruparTareas(ts: MaintenanceTask[]) {
  const m = new Map<string, MaintenanceTask[]>();
  for (const t of ts) m.set(t.grupo ?? 'Otras', [...(m.get(t.grupo ?? 'Otras') ?? []), t]);
  return [...m];
}

/** Crear o editar una tarea del catálogo. */
export function TaskModal({ tarea, open, onClose, onCreada }: {
  tarea: MaintenanceTask | null; open: boolean; onClose: () => void; onCreada?: (t: MaintenanceTask) => void;
}) {
  const qc = useQueryClient();
  const todas = useTareas(true);
  const [f, setF] = useState({ nombre: '', grupo: '', descripcion: '' });
  useEffect(() => {
    if (open) setF({ nombre: tarea?.nombre ?? '', grupo: tarea?.grupo ?? '', descripcion: tarea?.descripcion ?? '' });
  }, [open, tarea]);
  const grupos = useMemo(() => [...new Set((todas.data ?? []).map((t) => t.grupo).filter((g): g is string => !!g))].sort(), [todas.data]);
  const m = useMutation({
    mutationFn: () => {
      const body = { nombre: f.nombre, grupo: f.grupo.trim() || null, descripcion: f.descripcion.trim() || null };
      return tarea ? api.patch<MaintenanceTask>(`/tareas-mantenimiento/${tarea.id}`, body) : api.post<MaintenanceTask>('/tareas-mantenimiento', body);
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['tareas-mantenimiento'] });
      qc.invalidateQueries({ queryKey: ['planes'] });
      if (!tarea) onCreada?.(t);
      onClose();
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); e.stopPropagation(); m.mutate(); };
  return (
    <Modal open={open} title={tarea ? 'Editar tarea' : 'Nueva tarea de mantenimiento'} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="tarea-form" busy={m.isPending}>{tarea ? 'Guardar' : 'Crear tarea'}</Button></>}>
      <form id="tarea-form" className="stack" onSubmit={submit}>
        <Field label="Tarea *" hint="Lo que se hace, ej. Lubricar rodamientos">
          {(i) => <Input id={i} value={f.nombre} onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))} required minLength={3} maxLength={150} autoFocus />}
        </Field>
        <Field label="Grupo" hint="Para encontrarla rápido: Mecánico, Eléctrico, Lubricación…">
          {(i) => (
            <>
              <Input id={i} list="grupos-tareas" value={f.grupo} onChange={(e) => setF((s) => ({ ...s, grupo: e.target.value }))} maxLength={60} />
              <datalist id="grupos-tareas">{grupos.map((g) => <option key={g} value={g} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Detalle o pasos (opcional)" hint="Sale en la orden debajo de la tarea.">
          {(i) => <Textarea id={i} value={f.descripcion} onChange={(e) => setF((s) => ({ ...s, descripcion: e.target.value }))} maxLength={2000} />}
        </Field>
        {tarea?.planes ? <p className="muted small" style={{ margin: 0 }}>Está en {tarea.planes} plan{tarea.planes === 1 ? '' : 'es'}: el cambio se verá en sus próximas órdenes.</p> : null}
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

/**
 * Selector de tareas para un plan preventivo: se marcan del catálogo (agrupadas y con buscador) y quedan
 * numeradas en el orden en que se hacen. El administrador puede crear una tarea nueva sin salir del plan.
 */
export function TareasPicker({ value, onChange, conocidas = [] }: { value: string[]; onChange: (ids: string[]) => void; conocidas?: MaintenanceTask[] }) {
  const { can } = useAuth();
  const q = useTareas();
  const [filtro, setFiltro] = useState('');
  const [crear, setCrear] = useState(false);
  const porId = useMemo(() => new Map([...conocidas, ...(q.data ?? [])].map((t) => [t.id, t])), [q.data, conocidas]);
  const visibles = useMemo(() => {
    const n = filtro.trim().toLowerCase();
    return (q.data ?? []).filter((t) => !n || t.nombre.toLowerCase().includes(n) || (t.grupo ?? '').toLowerCase().includes(n));
  }, [q.data, filtro]);
  const marcar = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((x) => x !== id));
  const mover = (i: number, d: -1 | 1) => {
    const n = [...value];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onChange(n);
  };

  return (
    <div className="tareas-picker">
      {value.length ? (
        <ol className="tareas-elegidas" aria-label="Tareas del plan">
          {value.map((id, i) => {
            const t = porId.get(id);
            return (
              <li key={id}>
                <span className="tareas-n">{i + 1}</span>
                <span className="tareas-nombre">{t?.nombre ?? '…'}{t && !t.activa ? <span className="muted small"> (desactivada)</span> : null}</span>
                <button type="button" className="icon-btn" aria-label={`Subir ${t?.nombre ?? ''}`} disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                <button type="button" className="icon-btn" aria-label={`Quitar ${t?.nombre ?? ''}`} onClick={() => marcar(id, false)}><Icon name="trash" size={16} /></button>
              </li>
            );
          })}
        </ol>
      ) : <p className="muted small" style={{ margin: '0 0 8px' }}>Marque las tareas que se hacen en cada mantenimiento.</p>}

      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          {(q.data?.length ?? 0) > 6 ? (
            <Input type="search" placeholder="Buscar tarea…" aria-label="Buscar tarea" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          ) : null}
          <div className="tareas-catalogo">
            {agruparTareas(visibles).map(([grupo, ts]) => (
              <fieldset key={grupo}>
                <legend>{grupo}</legend>
                {ts.map((t) => (
                  <label key={t.id} className="tarea-op">
                    <input type="checkbox" checked={value.includes(t.id)} onChange={(e) => marcar(t.id, e.target.checked)} />
                    <span>{t.nombre}{t.descripcion ? <span className="muted small"> · {t.descripcion}</span> : null}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            {!visibles.length ? <p className="muted small" style={{ margin: 0 }}>{q.data?.length ? 'Ninguna tarea coincide.' : 'Aún no hay tareas en el catálogo.'}</p> : null}
          </div>
        </>
      )}
      {can('ADMIN') ? (
        <button type="button" className="link-btn" onClick={() => setCrear(true)}><Icon name="plus" size={16} /> Crear una tarea nueva</button>
      ) : null}
      {/* Fuera del formulario del plan (no se anidan formularios); el envío no se propaga al plan. */}
      {createPortal(<TaskModal tarea={null} open={crear} onClose={() => setCrear(false)} onCreada={(t) => onChange([...value, t.id])} />, document.body)}
    </div>
  );
}
