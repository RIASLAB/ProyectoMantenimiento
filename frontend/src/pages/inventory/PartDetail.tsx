import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs, uuid } from '../../api/client';
import type { KardexRow, SparePart, TipoMovimiento } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, KeyValue, Modal, PageHeader, Select, Spinner } from '../../components/ui';
import { dateTime, money, MOV_LABEL, qty } from '../../format';

const TIPOS_MANUALES: TipoMovimiento[] = ['ENTRADA_COMPRA', 'ENTRADA_DEVOLUCION', 'ENTRADA_AJUSTE', 'SALIDA_CONSUMO', 'SALIDA_AJUSTE'];

function MovementModal({ part, open, onClose }: { part: SparePart; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoMovimiento>('ENTRADA_COMPRA');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [referencia, setReferencia] = useState('');
  // Un id por intento: si la petición se reenvía (doble clic, red lenta) el servidor no duplica el movimiento.
  const [clientId, setClientId] = useState(() => uuid());

  const reset = () => {
    setTipo('ENTRADA_COMPRA'); setCantidad(''); setCosto(''); setMotivo(''); setReferencia('');
    setClientId(uuid());
  };

  const m = useMutation({
    mutationFn: () =>
      api.post('/inventario/movimientos', {
        repuestoId: part.id,
        tipo,
        cantidad: Number(cantidad),
        costoUnitario: tipo === 'ENTRADA_COMPRA' ? Number(costo) : undefined,
        motivo: motivo || undefined,
        referencia: referencia || undefined,
        clientId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repuesto', part.id] });
      qc.invalidateQueries({ queryKey: ['kardex', part.id] });
      qc.invalidateQueries({ queryKey: ['repuestos'] });
      reset();
      onClose();
    },
  });

  const esSalida = tipo.startsWith('SALIDA');
  const n = Number(cantidad);
  const insuficiente = esSalida && n > 0 && n > part.stock;
  const necesitaMotivo = tipo === 'ENTRADA_AJUSTE' || tipo === 'SALIDA_AJUSTE';
  const necesitaRef = tipo === 'SALIDA_CONSUMO';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };

  return (
    <Modal
      open={open}
      title="Registrar movimiento"
      onClose={() => { m.reset(); onClose(); }}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="mov-form" busy={m.isPending} disabled={insuficiente}>Registrar</Button>
        </>
      }
    >
      <form id="mov-form" className="stack" onSubmit={submit}>
        <p className="muted">{part.codigo} · {part.descripcion} · Stock actual: <strong>{qty(part.stock)} {part.unidad}</strong></p>
        <Field label="Tipo de movimiento">
          {(i) => (
            <Select id={i} value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
              {TIPOS_MANUALES.map((t) => <option key={t} value={t}>{MOV_LABEL[t]}</option>)}
            </Select>
          )}
        </Field>
        <Field label={`Cantidad (${part.unidad}) *`} error={insuficiente ? `No hay suficiente stock (${qty(part.stock)} ${part.unidad})` : undefined}>
          {(i) => <Input id={i} type="number" inputMode="decimal" min="0.001" step="0.001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />}
        </Field>
        {tipo === 'ENTRADA_COMPRA' ? (
          <Field label="Costo unitario (COP) *" hint={`Costo promedio actual: ${money(part.costoPromedio)}`}>
            {(i) => <Input id={i} type="number" inputMode="decimal" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} required />}
          </Field>
        ) : null}
        <Field label={necesitaRef ? 'Orden de trabajo *' : 'Referencia'} hint={necesitaRef ? 'Ej. OT-0031' : 'Factura, orden de compra, etc.'}>
          {(i) => <Input id={i} value={referencia} onChange={(e) => setReferencia(e.target.value)} required={necesitaRef} maxLength={80} />}
        </Field>
        <Field label={necesitaMotivo ? 'Motivo *' : 'Observación'}>
          {(i) => <Input id={i} value={motivo} onChange={(e) => setMotivo(e.target.value)} required={necesitaMotivo} maxLength={300} />}
        </Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

function CountModal({ part, open, onClose }: { part: SparePart; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [contada, setContada] = useState('');
  const [motivo, setMotivo] = useState('');
  const [result, setResult] = useState<{ diferencia: number } | null>(null);

  const m = useMutation({
    mutationFn: () => api.post<{ diferencia: number }>('/inventario/conteos', { repuestoId: part.id, cantidadContada: Number(contada), motivo }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['repuesto', part.id] });
      qc.invalidateQueries({ queryKey: ['kardex', part.id] });
      qc.invalidateQueries({ queryKey: ['repuestos'] });
    },
  });

  const close = () => {
    setContada(''); setMotivo(''); setResult(null); m.reset();
    onClose();
  };
  const dif = contada === '' ? null : Number(contada) - part.stock;

  return (
    <Modal
      open={open}
      title="Conteo físico"
      onClose={close}
      footer={
        result ? (
          <Button onClick={close}>Listo</Button>
        ) : (
          <>
            <Button variant="ghost" type="button" onClick={close}>Cancelar</Button>
            <Button type="submit" form="count-form" busy={m.isPending}>Registrar conteo</Button>
          </>
        )
      }
    >
      {result ? (
        <div className="alert alert-ok">
          {result.diferencia === 0
            ? 'El conteo coincide con el sistema. No se generó ajuste.'
            : `Se registró un ajuste de ${result.diferencia > 0 ? '+' : ''}${qty(result.diferencia)} ${part.unidad}.`}
        </div>
      ) : (
        <form id="count-form" className="stack" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <p className="muted">Stock en el sistema: <strong>{qty(part.stock)} {part.unidad}</strong></p>
          <Field
            label={`Cantidad contada (${part.unidad}) *`}
            hint={dif !== null && dif !== 0 ? `Diferencia: ${dif > 0 ? '+' : ''}${qty(dif)} ${part.unidad}. Se generará un ajuste.` : undefined}
          >
            {(i) => <Input id={i} type="number" inputMode="decimal" min="0" step="0.001" value={contada} onChange={(e) => setContada(e.target.value)} required />}
          </Field>
          <Field label="Motivo *" hint="Ej. Conteo mensual de bodega">
            {(i) => <Input id={i} value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} maxLength={300} />}
          </Field>
          {m.isError ? <ErrorBox error={m.error} /> : null}
        </form>
      )}
    </Modal>
  );
}

export function PartDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [modal, setModal] = useState<'mov' | 'count' | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const verKardex = can('ADMIN', 'AUTORIZADOR');

  const q = useQuery({ queryKey: ['repuesto', id], queryFn: () => api.get<SparePart>(`/repuestos/${id}`) });
  const k = useQuery({
    queryKey: ['kardex', id, desde, hasta],
    queryFn: () => api.get<{ movimientos: KardexRow[] }>(`/repuestos/${id}/kardex${qs({ desde, hasta })}`),
    enabled: verKardex,
  });

  const back = (
    <Link to="/inventario" className="back-link">
      <Icon name="back" size={18} /> Inventario
    </Link>
  );
  if (q.isPending) return <Spinner />;
  if (q.isError) return <>{back}<ErrorBox error={q.error} onRetry={() => q.refetch()} /></>;
  const p = q.data;

  return (
    <>
      <PageHeader
        back={back}
        title={p.descripcion}
        subtitle={<><span className="code">{p.codigo}</span>{!p.activo ? <> <Badge tone="muted">Inactivo</Badge></> : null}</>}
        actions={
          can('ADMIN') ? (
            <>
              <Link to={`/inventario/${p.id}/editar`} className="btn btn-ghost"><Icon name="edit" /> Editar</Link>
              <Button variant="secondary" onClick={() => setModal('count')} disabled={!p.activo}><Icon name="clipboard" /> Conteo</Button>
              <Button onClick={() => setModal('mov')} disabled={!p.activo}><Icon name="swap" /> Movimiento</Button>
            </>
          ) : null
        }
      />

      <div className="stats">
        <div className={`stat ${p.stock < 0 ? 'stat-bad' : p.bajoMinimo ? 'stat-warn' : ''}`}>
          <span>Stock</span>
          <strong>{qty(p.stock)} <small>{p.unidad}</small></strong>
          {p.stock < 0 ? <Badge tone="bad">Negativo: revisar</Badge> : p.bajoMinimo ? <Badge tone="warn">Bajo el mínimo</Badge> : null}
        </div>
        <div className="stat"><span>Stock mínimo</span><strong>{qty(p.stockMinimo)} <small>{p.unidad}</small></strong></div>
        <div className="stat"><span>Costo promedio</span><strong>{money(p.costoPromedio)}</strong></div>
        <div className="stat"><span>Valor en bodega</span><strong>{money(p.valorInventario)}</strong></div>
      </div>

      <section className="card">
        <KeyValue items={[['Ubicación', p.ubicacion], ['Código SAP', p.codigoSap], ['Unidad', p.unidad]]} />
      </section>

      {verKardex ? (
        <section className="card">
          <div className="card-head">
            <h2>Kardex</h2>
            <div className="inline-filters">
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" min={desde || undefined} />
            </div>
          </div>
          {k.isPending ? (
            <Spinner />
          ) : k.isError ? (
            <ErrorBox error={k.error} />
          ) : k.data.movimientos.length === 0 ? (
            <Empty title="Sin movimientos en el período" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Movimiento</th><th className="num">Cantidad</th><th className="num">Costo unit.</th>
                    <th className="num">Saldo</th><th>Referencia / motivo</th><th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {[...k.data.movimientos].reverse().map((r) => (
                    <tr key={r.id}>
                      <td data-label="Fecha">{dateTime(r.fecha)}</td>
                      <td data-label="Movimiento">{MOV_LABEL[r.tipo]}</td>
                      <td data-label="Cantidad" className={`num ${r.cantidad < 0 ? 'text-bad' : 'text-ok'}`}>{r.cantidad > 0 ? '+' : ''}{qty(r.cantidad)}</td>
                      <td data-label="Costo unit." className="num">{money(r.costoUnitario)}</td>
                      <td data-label="Saldo" className="num"><strong>{qty(r.saldo)}</strong></td>
                      <td data-label="Referencia">{[r.referencia, r.motivo].filter(Boolean).join(' · ') || '—'}</td>
                      <td data-label="Usuario">{r.usuario ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <MovementModal part={p} open={modal === 'mov'} onClose={() => setModal(null)} />
      <CountModal part={p} open={modal === 'count'} onClose={() => setModal(null)} />
    </>
  );
}
