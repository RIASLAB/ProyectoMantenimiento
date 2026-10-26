import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Purchase, PurchaseDetail as Detail } from '../../api/types';
import { Badge, Button, ErrorBox, Field, Icon, Input, KeyValue, Modal, PageHeader, Spinner, Textarea } from '../../components/ui';
import { COMPRA_ESTADO_LABEL, COMPRA_ESTADO_TONE, dateTime, money, qty } from '../../format';

const ACCION: Record<string, string> = {
  COMPRA_SOLICITADA: 'Solicitud creada',
  COMPRA_AJUSTADA: 'Cantidad ajustada por el faltante de la OT',
  COMPRA_APROBADA: 'Aprobada',
  COMPRA_RECHAZADA: 'Rechazada',
  COMPRA_REALIZADA: 'Compra registrada',
  COMPRA_RECIBIDA: 'Repuesto recibido en bodega',
  COMPRA_CANCELADA: 'Cancelada',
};

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['compras'] });
    qc.invalidateQueries({ queryKey: ['compra'] });
    qc.invalidateQueries({ queryKey: ['repuestos'] });
    qc.invalidateQueries({ queryKey: ['repuesto'] });
    qc.invalidateQueries({ queryKey: ['orden'] });
  };
}

export function RejectModal({ compra, open, onClose, cancelar }: { compra: Purchase; open: boolean; onClose: () => void; cancelar?: boolean }) {
  const invalidate = useInvalidate();
  const [motivo, setMotivo] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/compras/${compra.id}/${cancelar ? 'cancelar' : 'rechazar'}`, { motivo }),
    onSuccess: () => { invalidate(); setMotivo(''); onClose(); },
  });
  return (
    <Modal open={open} title={`${cancelar ? 'Cancelar' : 'Rechazar'} ${compra.codigo}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Volver</Button><Button variant="danger" busy={m.isPending} disabled={motivo.trim().length < 3} onClick={() => m.mutate()}>{cancelar ? 'Cancelar solicitud' : 'Rechazar'}</Button></>}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>{qty(compra.cantidad)} {compra.repuesto.unidad} · {compra.repuesto.descripcion}</p>
        <Field label="Motivo *">{(i) => <Textarea id={i} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />}</Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </div>
    </Modal>
  );
}

function BuyModal({ s, open, onClose }: { s: Detail; open: boolean; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [proveedor, setProveedor] = useState('');
  const [oc, setOc] = useState('');
  const [costo, setCosto] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/compras/${s.id}/comprar`, { proveedor, numeroOrdenCompra: oc || undefined, costoEstimado: costo ? Number(costo) : undefined }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <Modal open={open} title="Registrar compra" onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="buy-form" busy={m.isPending}>Guardar</Button></>}>
      <form id="buy-form" className="stack" onSubmit={submit}>
        <Field label="Proveedor *">{(i) => <Input id={i} value={proveedor} onChange={(e) => setProveedor(e.target.value)} required minLength={2} maxLength={150} />}</Field>
        <Field label="N.° de orden de compra">{(i) => <Input id={i} value={oc} onChange={(e) => setOc(e.target.value)} maxLength={60} />}</Field>
        <Field label="Costo unitario estimado (COP)">{(i) => <Input id={i} type="number" inputMode="decimal" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} />}</Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

function ReceiveModal({ s, open, onClose }: { s: Detail; open: boolean; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [cantidad, setCantidad] = useState(String(s.cantidad));
  const [costo, setCosto] = useState(s.costoEstimado ? String(s.costoEstimado) : '');
  const [factura, setFactura] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/compras/${s.id}/recibir`, { cantidadRecibida: Number(cantidad), costoUnitario: Number(costo), factura: factura || undefined }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  const diferente = Number(cantidad) !== s.cantidad;
  return (
    <Modal open={open} title="Recibir en bodega" onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="receive-form" busy={m.isPending}>Registrar entrada</Button></>}>
      <form id="receive-form" className="stack" onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>Se suma al inventario y actualiza el costo promedio del repuesto.</p>
        <Field label={`Cantidad recibida (${s.repuesto.unidad}) *`} hint={diferente ? `Se pidieron ${qty(s.cantidad)}. La diferencia queda registrada.` : undefined}>
          {(i) => <Input id={i} type="number" inputMode="decimal" min="0.001" step="0.001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />}
        </Field>
        <Field label="Costo unitario real (COP) *">{(i) => <Input id={i} type="number" inputMode="decimal" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} required />}</Field>
        <Field label="Factura">{(i) => <Input id={i} value={factura} onChange={(e) => setFactura(e.target.value)} maxLength={60} />}</Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

export function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const invalidate = useInvalidate();
  const [modal, setModal] = useState<'rechazar' | 'cancelar' | 'comprar' | 'recibir' | null>(null);
  const q = useQuery({ queryKey: ['compra', id], queryFn: () => api.get<Detail>(`/compras/${id}`) });
  const aprobar = useMutation({ mutationFn: () => api.post(`/compras/${id}/aprobar`), onSuccess: invalidate });

  const back = <Link to="/compras" className="back-link"><Icon name="back" size={18} /> Compras</Link>;
  if (q.isPending) return <Spinner />;
  if (q.isError) return <>{back}<ErrorBox error={q.error} onRetry={() => q.refetch()} /></>;
  const s = q.data;
  const a = s.acciones;

  return (
    <>
      <PageHeader
        back={back}
        title={`${s.codigo} · ${s.repuesto.descripcion}`}
        subtitle={<><Badge tone={COMPRA_ESTADO_TONE[s.estado]}>{COMPRA_ESTADO_LABEL[s.estado]}</Badge>{s.origen === 'AUTOMATICA' ? <Badge tone="info">Automática por faltante</Badge> : null}</>}
      />

      {a.aprobar || a.rechazar || a.comprar || a.recibir || a.cancelar ? (
        <div className="action-bar">
          {a.aprobar ? <Button busy={aprobar.isPending} onClick={() => aprobar.mutate()}>Aprobar</Button> : null}
          {a.rechazar ? <Button variant="secondary" onClick={() => setModal('rechazar')}>Rechazar</Button> : null}
          {a.recibir ? <Button onClick={() => setModal('recibir')}>Recibir en bodega</Button> : null}
          {a.comprar ? <Button variant="secondary" onClick={() => setModal('comprar')}>Registrar compra</Button> : null}
          {a.cancelar ? <Button variant="ghost" onClick={() => setModal('cancelar')}>Cancelar solicitud</Button> : null}
        </div>
      ) : null}
      {s.estado === 'PENDIENTE' && a.esPropia ? <div className="alert alert-warn">Usted hizo esta solicitud, así que no puede aprobarla. La decide el autorizador de compras.</div> : null}
      {aprobar.isError ? <ErrorBox error={aprobar.error} /> : null}
      {s.motivoRechazo ? <div className="alert alert-bad">{s.estado === 'RECHAZADA' ? 'Rechazada' : 'Cancelada'}: {s.motivoRechazo}</div> : null}

      <div className="grid-2">
        <section className="card">
          <h2>Solicitud</h2>
          <p className="desc">{s.justificacion}</p>
          <div style={{ height: 14 }} />
          <KeyValue items={[
            ['Repuesto', <Link to={`/inventario/${s.repuesto.id}`}>{s.repuesto.codigo} · {s.repuesto.descripcion}</Link>],
            ['Cantidad', `${qty(s.cantidad)} ${s.repuesto.unidad}`],
            ['En bodega hoy', `${qty(s.stock)} ${s.repuesto.unidad}`],
            ['Orden de trabajo', s.orden ? <Link to={`/ordenes/${s.orden.id}`}>{s.orden.codigo}{s.orden.activo ? ` · ${s.orden.activo.nombre}` : ''}</Link> : 'No aplica'],
            ['Solicitada por', `${s.solicitadoPor?.nombre ?? '—'} · ${dateTime(s.creadoEn)}`],
            ['Decidida por', s.decididaPor ? `${s.decididaPor.nombre} · ${s.decididaEn ? dateTime(s.decididaEn) : ''}` : 'Pendiente'],
          ]} />
        </section>
        <section className="card">
          <h2>Compra y recepción</h2>
          <KeyValue items={[
            ['Proveedor', s.proveedor],
            ['Orden de compra', s.numeroOrdenCompra],
            ['Costo estimado', s.costoEstimado !== null ? money(s.costoEstimado) : null],
            ['Recibido', s.cantidadRecibida !== null ? `${qty(s.cantidadRecibida)} ${s.repuesto.unidad}` : null],
            ['Costo real', s.costoUnitario !== null ? `${money(s.costoUnitario)} c/u · total ${money(s.costoUnitario * (s.cantidadRecibida ?? 0))}` : null],
            ['Factura', s.factura],
            ['Recibido por', s.recibidaPor ? `${s.recibidaPor.nombre} · ${s.recibidaEn ? dateTime(s.recibidaEn) : ''}` : null],
          ]} />
        </section>
        <section className="card span-2">
          <h2>Historial</h2>
          <ol className="timeline">
            {[...s.historial].reverse().map((h) => (
              <li key={h.id}>
                <strong>{ACCION[h.accion] ?? h.accion}</strong>
                {h.detalle && typeof h.detalle.motivo === 'string' ? <div>{h.detalle.motivo}</div> : null}
                <div className="muted">{dateTime(h.creadoEn)} · {h.usuario?.nombre ?? 'Sistema'}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <RejectModal compra={s} open={modal === 'rechazar'} onClose={() => setModal(null)} />
      <RejectModal compra={s} cancelar open={modal === 'cancelar'} onClose={() => setModal(null)} />
      {modal === 'comprar' ? <BuyModal s={s} open onClose={() => setModal(null)} /> : null}
      {modal === 'recibir' ? <ReceiveModal s={s} open onClose={() => setModal(null)} /> : null}
    </>
  );
}
