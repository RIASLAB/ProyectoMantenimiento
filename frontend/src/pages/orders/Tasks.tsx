import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { MaintenanceTask } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { agruparTareas, TaskModal, useTareas } from '../../components/tasks';
import { Badge, Button, Empty, ErrorBox, Icon, Modal, PageHeader, Spinner } from '../../components/ui';
import { OrdersTabs } from './OrdersList';

/**
 * Catálogo de tareas de mantenimiento (D-31): se crean una vez y se eligen al armar los preventivos.
 * Una tarea que ya está en planes no se borra: se desactiva y deja de ofrecerse en los planes nuevos.
 */
export function Tasks() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useTareas(true);
  const [edit, setEdit] = useState<MaintenanceTask | null>(null);
  const [open, setOpen] = useState(false);
  const [borrar, setBorrar] = useState<MaintenanceTask | null>(null);
  const invalidar = () => { qc.invalidateQueries({ queryKey: ['tareas-mantenimiento'] }); qc.invalidateQueries({ queryKey: ['bitacora'] }); };
  const activar = useMutation({
    mutationFn: (t: MaintenanceTask) => api.patch(`/tareas-mantenimiento/${t.id}`, { activa: !t.activa }),
    onSuccess: invalidar,
  });
  const eliminar = useMutation({
    mutationFn: (t: MaintenanceTask) => api.delete(`/tareas-mantenimiento/${t.id}`),
    onSuccess: () => { invalidar(); setBorrar(null); },
  });
  const nueva = () => { setEdit(null); setOpen(true); };

  return (
    <>
      <PageHeader title="Mantenimiento" actions={can('ADMIN') ? <Button onClick={nueva}><Icon name="plus" /> Nueva tarea</Button> : null} />
      <OrdersTabs />
      <p className="muted" style={{ marginTop: 0 }}>Escriba aquí una vez las tareas que se repiten; al crear un plan preventivo solo se marcan las que aplican.</p>
      {activar.isError ? <ErrorBox error={activar.error} /> : null}
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data.length ? (
        <Empty title="Aún no hay tareas">{can('ADMIN') ? <Button onClick={nueva}>Crear la primera</Button> : null}</Empty>
      ) : agruparTareas(q.data).map(([grupo, ts]) => (
        <section key={grupo} className="tareas-grupo">
          <p className="subtle-head">{grupo}</p>
          <ul className="list">
            {ts.map((t) => (
              <li key={t.id} className={`list-row static ${t.activa ? '' : 'is-off'}`}>
                <div className="list-main">
                  <strong>{t.nombre}</strong>
                  {t.descripcion ? <span className="muted">{t.descripcion}</span> : null}
                  <span className="muted small">{t.planes ? `En ${t.planes} plan${t.planes === 1 ? '' : 'es'}` : 'Sin usar todavía'}</span>
                </div>
                <div className="list-meta">
                  {!t.activa ? <Badge tone="muted">Desactivada</Badge> : null}
                  {can('ADMIN') ? (
                    <>
                      <Button variant="ghost" onClick={() => { setEdit(t); setOpen(true); }}>Editar</Button>
                      {t.planes ? (
                        <Button variant="ghost" busy={activar.isPending && activar.variables?.id === t.id} onClick={() => activar.mutate(t)}>{t.activa ? 'Desactivar' : 'Activar'}</Button>
                      ) : (
                        <Button variant="ghost" onClick={() => { eliminar.reset(); setBorrar(t); }}>Eliminar</Button>
                      )}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <TaskModal tarea={edit} open={open} onClose={() => setOpen(false)} />
      <Modal open={!!borrar} title="Eliminar tarea" onClose={() => setBorrar(null)}
        footer={<><Button variant="ghost" onClick={() => setBorrar(null)}>Cancelar</Button><Button variant="danger" busy={eliminar.isPending} onClick={() => borrar && eliminar.mutate(borrar)}>Eliminar</Button></>}>
        <p style={{ marginTop: 0 }}>¿Eliminar <strong>{borrar?.nombre}</strong> del catálogo?</p>
        {eliminar.isError ? <ErrorBox error={eliminar.error} /> : null}
      </Modal>
    </>
  );
}
