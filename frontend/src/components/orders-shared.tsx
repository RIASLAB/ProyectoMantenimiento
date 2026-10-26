import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { EstadoOrden, SparePart, WorkOrderSummary } from '../api/types';
import { ORDEN_ESTADO_LABEL, ORDEN_ESTADO_TONE, TIPO_LABEL } from '../format';
import { Badge, Button, Icon, Input, Select } from './ui';

export interface PartRow { repuestoId: string; cantidad: string }

/** Filas editables de repuesto + cantidad (kit de plan, planificados de la OT y usados al cerrar). */
export function PartRows({ rows, onChange, showStock = true }: { rows: PartRow[]; onChange: (r: PartRow[]) => void; showStock?: boolean }) {
  const parts = useQuery({ queryKey: ['repuestos', '', false], queryFn: () => api.get<SparePart[]>('/repuestos') });
  const byId = new Map(parts.data?.map((p) => [p.id, p]));
  const set = (i: number, patch: Partial<PartRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const usados = new Set(rows.map((r) => r.repuestoId));

  return (
    <div className="part-rows">
      {rows.length === 0 ? <p className="muted small">Sin repuestos.</p> : null}
      {rows.map((r, i) => {
        const p = byId.get(r.repuestoId);
        const n = Number(r.cantidad);
        const falta = showStock && p && n > Math.max(p.stock, 0);
        return (
          <div className="part-row" key={i}>
            <Select value={r.repuestoId} onChange={(e) => set(i, { repuestoId: e.target.value })} aria-label="Repuesto" required>
              <option value="" disabled>Seleccione un repuesto…</option>
              {parts.data?.map((x) => (
                <option key={x.id} value={x.id} disabled={x.id !== r.repuestoId && usados.has(x.id)}>
                  {x.codigo} · {x.descripcion}{showStock ? ` (stock ${x.stock} ${x.unidad})` : ''}
                </option>
              ))}
            </Select>
            <Input type="number" inputMode="decimal" min="0" step="0.001" value={r.cantidad} onChange={(e) => set(i, { cantidad: e.target.value })} aria-label="Cantidad" required className={`input qty ${falta ? 'input-warn' : ''}`} />
            <button type="button" className="icon-btn" aria-label="Quitar repuesto" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Icon name="trash" size={18} />
            </button>
            {falta ? <p className="field-error part-row-msg">Solo hay {p.stock} {p.unidad} en bodega</p> : null}
          </div>
        );
      })}
      <Button type="button" variant="ghost" onClick={() => onChange([...rows, { repuestoId: '', cantidad: '1' }])}>
        <Icon name="plus" /> Agregar repuesto
      </Button>
    </div>
  );
}

export const rowsToPayload = (rows: PartRow[]) =>
  rows.filter((r) => r.repuestoId && Number(r.cantidad) >= 0).map((r) => ({ repuestoId: r.repuestoId, cantidad: Number(r.cantidad) }));

/** Imagen protegida por token: se descarga como blob y se muestra con una URL local. */
export function useProtectedImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let revoked = false;
    let objectUrl: string | null = null;
    api.blob(path).then((b) => {
      if (revoked) return;
      objectUrl = URL.createObjectURL(b);
      setUrl(objectUrl);
    }).catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return url;
}

export function OrderStateBadge({ estado }: { estado: EstadoOrden }) {
  return <Badge tone={ORDEN_ESTADO_TONE[estado]}>{ORDEN_ESTADO_LABEL[estado]}</Badge>;
}

/** Insignias de una OT: estado, tipo, parada y vencimiento. */
export function OrderBadges({ o }: { o: WorkOrderSummary }) {
  return (
    <>
      <OrderStateBadge estado={o.estado} />
      {o.tipo === 'PREVENTIVO' ? <Badge tone="info">{TIPO_LABEL.PREVENTIVO}</Badge> : null}
      {o.maquinaParada && !o.finParada && o.estado !== 'CANCELADA' ? <Badge tone="bad">Máquina parada</Badge> : null}
      {o.vencida ? <Badge tone="bad">Vencido hace {Math.abs(o.diasParaVencer ?? 0)} d</Badge> : null}
      {o.proxima ? <Badge tone="warn">{o.diasParaVencer === 0 ? 'Vence hoy' : `Vence en ${o.diasParaVencer} d`}</Badge> : null}
      {o.prioridad === 'ALTA' && !['CERRADA', 'CANCELADA'].includes(o.estado) ? <Badge tone="warn">Prioridad alta</Badge> : null}
    </>
  );
}
