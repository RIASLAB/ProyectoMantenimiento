import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PersonRef, Prioridad } from '../api/types';
import { PRIORIDAD_LABEL } from '../format';
import { Badge, Button, ErrorBox, Modal, Spinner } from './ui';

/** Técnico (o administrador) con las órdenes que tiene asignadas sin cerrar. */
export interface TecnicoCarga extends PersonRef { rol: string; carga: { abiertas: number; urgentes: number; enCurso: number } }

export function useTecnicos(enabled = true) {
  return useQuery({ queryKey: ['tecnicos'], queryFn: () => api.get<TecnicoCarga[]>('/usuarios/tecnicos'), enabled });
}

/** "2 órdenes · 1 urgente · trabajando en 1", o "Sin órdenes pendientes". */
export function textoCarga(c: TecnicoCarga['carga'] | undefined) {
  if (!c || !c.abiertas) return 'Sin órdenes pendientes';
  return [c.abiertas === 1 ? '1 orden' : `${c.abiertas} órdenes`, c.urgentes ? `${c.urgentes} urgente${c.urgentes === 1 ? '' : 's'}` : null, c.enCurso ? `trabajando en ${c.enCurso}` : null]
    .filter(Boolean).join(' · ');
}

/**
 * Asignar o reasignar una orden (D-32). Muestra cuántas órdenes tiene cada técnico, para repartir cuando todos
 * están ocupados; los libres van primero. Se usa desde la orden y desde la lista de órdenes.
 */
export function AssignModal({ orden, open, onClose }: {
  orden: { id: string; codigo: string; prioridad: Prioridad; asignadoA: PersonRef | null; activo?: { codigo: string; nombre: string } };
  open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const tecnicos = useTecnicos(open);
  const [sel, setSel] = useState('');
  useEffect(() => { if (open) setSel(orden.asignadoA?.id ?? ''); }, [open, orden.asignadoA]);
  const m = useMutation({
    mutationFn: () => api.post(`/ordenes/${orden.id}/asignar`, { tecnicoId: sel }),
    onSuccess: () => {
      for (const k of ['orden', 'ordenes', 'ordenes-resumen', 'tecnicos', 'activos', 'activo']) qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
  });
  useEffect(() => { if (open) m.reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Técnicos primero (los administradores al final) y, entre ellos, los menos cargados.
  const lista = [...(tecnicos.data ?? [])].sort((a, b) => Number(a.rol === 'ADMIN') - Number(b.rol === 'ADMIN') || a.carga.abiertas - b.carga.abiertas || a.nombre.localeCompare(b.nombre));
  return (
    <Modal open={open} title={orden.asignadoA ? `Reasignar ${orden.codigo}` : `Asignar ${orden.codigo}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button busy={m.isPending} disabled={!sel || sel === orden.asignadoA?.id} onClick={() => m.mutate()}>Asignar</Button></>}>
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          {orden.activo ? <>{orden.activo.codigo} · {orden.activo.nombre} · </> : null}Prioridad {PRIORIDAD_LABEL[orden.prioridad].toLowerCase()}. Debajo de cada nombre, lo que tiene pendiente.
        </p>
        {tecnicos.isPending ? <Spinner /> : tecnicos.isError ? <ErrorBox error={tecnicos.error} onRetry={() => tecnicos.refetch()} /> : (
          <div className="asignar-lista" role="radiogroup" aria-label="Técnico">
            {lista.map((t) => (
              <label key={t.id} className={`asignar-op ${sel === t.id ? 'on' : ''}`}>
                <input type="radio" name="tecnico" value={t.id} checked={sel === t.id} onChange={() => setSel(t.id)} />
                <span className="asignar-nombre">
                  <strong>{t.nombre}</strong>{t.rol === 'ADMIN' ? <span className="muted small"> (administrador)</span> : null}
                  {orden.asignadoA?.id === t.id ? <span className="muted small"> · tiene esta orden</span> : null}
                  <span className="muted small asignar-carga">{textoCarga(t.carga)}</span>
                </span>
                {!t.carga.abiertas ? <Badge tone="ok">Libre</Badge> : t.carga.urgentes ? <Badge tone="bad">{t.carga.urgentes} urgente{t.carga.urgentes === 1 ? '' : 's'}</Badge> : <Badge tone="muted">{t.carga.abiertas}</Badge>}
              </label>
            ))}
          </div>
        )}
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </div>
    </Modal>
  );
}
