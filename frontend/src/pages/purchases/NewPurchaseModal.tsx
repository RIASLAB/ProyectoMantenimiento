import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Purchase, SparePart } from '../../api/types';
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea } from '../../components/ui';

/** Solicitud manual de compra (COM-02). Se puede abrir con el repuesto o la OT ya elegidos. */
export function NewPurchaseModal({ open, onClose, repuestoId, ordenId, ordenCodigo }: {
  open: boolean; onClose: () => void; repuestoId?: string; ordenId?: string; ordenCodigo?: string;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const parts = useQuery({ queryKey: ['repuestos', '', false], queryFn: () => api.get<SparePart[]>('/repuestos'), enabled: open });
  const [rep, setRep] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [justificacion, setJustificacion] = useState('');

  useEffect(() => {
    if (!open) return;
    setRep(repuestoId ?? '');
    setCantidad('1');
    setJustificacion(ordenCodigo ? `Para ${ordenCodigo}` : '');
  }, [open, repuestoId, ordenCodigo]);

  const m = useMutation({
    mutationFn: () => api.post<Purchase>('/compras', { repuestoId: rep, cantidad: Number(cantidad), justificacion, ordenId }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['orden'] });
      onClose();
      nav(`/compras/${s.id}`);
    },
  });
  const sel = parts.data?.find((p) => p.id === rep);
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <Modal open={open} title="Solicitar compra" onClose={() => { m.reset(); onClose(); }}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="purchase-form" busy={m.isPending}>Enviar solicitud</Button></>}>
      <form id="purchase-form" className="stack" onSubmit={submit}>
        {ordenCodigo ? <p className="muted" style={{ margin: 0 }}>Para la orden {ordenCodigo}</p> : null}
        <Field label="Repuesto *" hint={sel ? `En bodega: ${sel.stock} ${sel.unidad} · mínimo ${sel.stockMinimo}` : undefined}>
          {(i) => (
            <Select id={i} value={rep} onChange={(e) => setRep(e.target.value)} required disabled={!!repuestoId}>
              <option value="" disabled>Seleccione…</option>
              {parts.data?.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>)}
            </Select>
          )}
        </Field>
        <Field label={`Cantidad${sel ? ` (${sel.unidad})` : ''} *`}>
          {(i) => <Input id={i} type="number" inputMode="decimal" min="0.001" step="0.001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />}
        </Field>
        <Field label="¿Para qué se necesita? *">
          {(i) => <Textarea id={i} value={justificacion} onChange={(e) => setJustificacion(e.target.value)} required minLength={5} maxLength={1000} />}
        </Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}
