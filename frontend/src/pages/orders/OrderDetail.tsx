import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { MomentoFoto, PersonRef, WorkOrderDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { OrderBadges, PartRow, PartRows, rowsToPayload, useProtectedImage } from '../../components/orders-shared';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, KeyValue, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { date, dateTime, duration, money, ORDEN_ESTADO_LABEL, PRIORIDAD_LABEL, qty, TIPO_LABEL, toLocalInput } from '../../format';

type ModalKind = 'asignar' | 'esperar' | 'cerrar' | 'cancelar' | 'repuestos' | null;
const MOMENTO_LABEL: Record<MomentoFoto, string> = { REPORTE: 'Reporte', ANTES: 'Antes', DESPUES: 'Después' };

function useOrderMutation<T>(id: string, fn: (body: T) => Promise<unknown>, onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden', id] });
      qc.invalidateQueries({ queryKey: ['ordenes'] });
      qc.invalidateQueries({ queryKey: ['ordenes-resumen'] });
      qc.invalidateQueries({ queryKey: ['activos'] });
      qc.invalidateQueries({ queryKey: ['activo'] });
      qc.invalidateQueries({ queryKey: ['repuestos'] });
      onDone?.();
    },
  });
}

function AssignModal({ o, open, onClose }: { o: WorkOrderDetail; open: boolean; onClose: () => void }) {
  const tecnicos = useQuery({ queryKey: ['tecnicos'], queryFn: () => api.get<Array<PersonRef & { rol: string }>>('/usuarios/tecnicos'), enabled: open });
  const [sel, setSel] = useState(o.asignadoA?.id ?? '');
  const m = useOrderMutation(o.id, () => api.post(`/ordenes/${o.id}/asignar`, { tecnicoId: sel }), onClose);
  return (
    <Modal open={open} title={o.asignadoA ? 'Reasignar orden' : 'Asignar orden'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button busy={m.isPending} disabled={!sel || sel === o.asignadoA?.id} onClick={() => m.mutate(undefined)}>Asignar</Button></>}>
      <div className="stack">
        <Field label="Técnico">
          {(i) => (
            <Select id={i} value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="" disabled>Seleccione…</option>
              {tecnicos.data?.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.rol === 'ADMIN' ? ' (administrador)' : ''}</option>)}
            </Select>
          )}
        </Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </div>
    </Modal>
  );
}

function NoteModal({ o, open, onClose, kind }: { o: WorkOrderDetail; open: boolean; onClose: () => void; kind: 'esperar' | 'cancelar' }) {
  const [texto, setTexto] = useState('');
  const m = useOrderMutation(o.id, () =>
    kind === 'esperar' ? api.post(`/ordenes/${o.id}/esperar-repuesto`, { nota: texto || undefined }) : api.post(`/ordenes/${o.id}/cancelar`, { motivo: texto }),
    () => { setTexto(''); onClose(); });
  return (
    <Modal open={open} title={kind === 'esperar' ? 'En espera de repuesto' : 'Cancelar orden'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Volver</Button><Button variant={kind === 'cancelar' ? 'danger' : 'primary'} busy={m.isPending} disabled={kind === 'cancelar' && texto.trim().length < 3} onClick={() => m.mutate(undefined)}>{kind === 'esperar' ? 'Pausar trabajo' : 'Cancelar orden'}</Button></>}>
      <div className="stack">
        <Field label={kind === 'esperar' ? '¿Qué repuesto falta? (opcional)' : 'Motivo de la cancelación *'}>
          {(i) => <Textarea id={i} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={kind === 'esperar' ? 500 : 300} />}
        </Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </div>
    </Modal>
  );
}

function PlannedPartsModal({ o, open, onClose }: { o: WorkOrderDetail; open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<PartRow[]>([]);
  useEffect(() => { if (open) setRows(o.repuestos.map((r) => ({ repuestoId: r.repuestoId, cantidad: String(r.cantidadPlanificada) }))); }, [open, o.repuestos]);
  const m = useOrderMutation(o.id, () => api.put(`/ordenes/${o.id}/repuestos`, { repuestos: rowsToPayload(rows) }), onClose);
  return (
    <Modal open={open} title="Repuestos planificados" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button busy={m.isPending} onClick={() => m.mutate(undefined)}>Guardar</Button></>}>
      <div className="stack">
        <PartRows rows={rows} onChange={setRows} />
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </div>
    </Modal>
  );
}

function CloseModal({ o, open, onClose }: { o: WorkOrderDetail; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const tecnicos = useQuery({ queryKey: ['tecnicos'], queryFn: () => api.get<Array<PersonRef & { rol: string }>>('/usuarios/tecnicos'), enabled: open });
  const [trabajo, setTrabajo] = useState('');
  const [rows, setRows] = useState<PartRow[]>([]);
  const [labor, setLabor] = useState<Array<{ tecnicoId: string; horas: string }>>([]);
  const [externos, setExternos] = useState('');
  const [fin, setFin] = useState('');
  const [finInicial, setFinInicial] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows(o.repuestos.map((r) => ({ repuestoId: r.repuestoId, cantidad: String(r.cantidadPlanificada) })));
    setLabor([{ tecnicoId: o.asignadoA?.id ?? user?.id ?? '', horas: '' }]);
    const ahora = toLocalInput(new Date());
    setFin(ahora);
    setFinInicial(ahora);
  }, [open, o.repuestos, o.asignadoA, user]);

  const m = useOrderMutation(o.id, () =>
    api.post(`/ordenes/${o.id}/cerrar`, {
      trabajoRealizado: trabajo,
      repuestosUsados: rowsToPayload(rows),
      manoObra: labor.filter((l) => l.tecnicoId && Number(l.horas) > 0).map((l) => ({ tecnicoId: l.tecnicoId, horas: Number(l.horas) })),
      costoServiciosExternos: externos ? Number(externos) : undefined,
      // Si no se cambió la hora sugerida, se envía el momento exacto (con segundos).
      finParada: o.maquinaParada ? (fin === finInicial ? new Date() : new Date(fin)).toISOString() : undefined,
    }), onClose);

  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(undefined); };

  return (
    <Modal open={open} title={`Cerrar ${o.codigo}`} onClose={onClose}
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="close-form" busy={m.isPending}>Cerrar orden</Button></>}>
      <form id="close-form" className="stack" onSubmit={submit}>
        <Field label="Trabajo realizado *">
          {(i) => <Textarea id={i} value={trabajo} onChange={(e) => setTrabajo(e.target.value)} required minLength={5} maxLength={4000} />}
        </Field>
        {o.maquinaParada ? (
          <Field label="¿Cuándo volvió a operar la máquina? *" hint={o.inicioParada ? `Parada desde ${dateTime(o.inicioParada)}` : undefined}>
            {(i) => <Input id={i} type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} required max={toLocalInput(new Date(Date.now() + 60_000))} />}
          </Field>
        ) : null}
        <div>
          <p className="subtle-head">Repuestos usados</p>
          <p className="muted small" style={{ marginTop: 0 }}>Ajuste a lo que realmente se usó. Se descuenta del inventario al cerrar.</p>
          <PartRows rows={rows} onChange={setRows} />
        </div>
        <div>
          <p className="subtle-head">Mano de obra (horas)</p>
          <div className="stack" style={{ gap: 8 }}>
            {labor.map((l, i) => (
              <div className="labor-row" key={i}>
                <Select value={l.tecnicoId} onChange={(e) => setLabor(labor.map((x, j) => (j === i ? { ...x, tecnicoId: e.target.value } : x)))} aria-label="Técnico">
                  <option value="" disabled>Técnico…</option>
                  {tecnicos.data?.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </Select>
                <Input type="number" inputMode="decimal" min="0" max="200" step="0.25" placeholder="Horas" value={l.horas} onChange={(e) => setLabor(labor.map((x, j) => (j === i ? { ...x, horas: e.target.value } : x)))} aria-label="Horas" className="input qty" />
                <button type="button" className="icon-btn" aria-label="Quitar" onClick={() => setLabor(labor.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={() => setLabor([...labor, { tecnicoId: '', horas: '' }])}><Icon name="plus" /> Agregar técnico</Button>
          </div>
        </div>
        <Field label="Servicios externos (COP)" hint="Contratistas, mecanizado, etc.">
          {(i) => <Input id={i} type="number" inputMode="decimal" min="0" step="1" value={externos} onChange={(e) => setExternos(e.target.value)} />}
        </Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

function Photo({ id, momento, onOpen }: { id: string; momento: MomentoFoto; onOpen: (url: string) => void }) {
  const url = useProtectedImage(`/ordenes/fotos/${id}/archivo`);
  return (
    <button type="button" className="photo" onClick={() => url && onOpen(url)} aria-label={`Foto ${MOMENTO_LABEL[momento]}`}>
      {url ? <img src={url} alt="" /> : <span className="spinner sm" />}
      <span><Badge tone="muted">{MOMENTO_LABEL[momento]}</Badge></span>
    </button>
  );
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [modal, setModal] = useState<ModalKind>(null);
  const [visor, setVisor] = useState<string | null>(null);
  const [momento, setMomento] = useState<MomentoFoto>('ANTES');
  const [fotoError, setFotoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const llegada = location.state as { reportada?: string; fotoFallo?: boolean } | null;

  const q = useQuery({ queryKey: ['orden', id], queryFn: () => api.get<WorkOrderDetail>(`/ordenes/${id}`) });
  const simple = useOrderMutation<string>(id!, (accion) => api.post(`/ordenes/${id}/${accion}`));
  const tomar = useOrderMutation<string>(id!, (me) => api.post(`/ordenes/${id}/asignar`, { tecnicoId: me }));

  const subir = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append('archivo', f);
      return api.post(`/ordenes/${id}/fotos?momento=${momento}`, fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orden', id] }),
    onError: (e) => setFotoError(e.message),
  });
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setFotoError('');
    if (f) subir.mutate(f);
  };

  const back = <Link to="/ordenes" className="back-link"><Icon name="back" size={18} /> Órdenes</Link>;
  if (q.isPending) return <Spinner />;
  if (q.isError) return <>{back}<ErrorBox error={q.error} onRetry={() => q.refetch()} /></>;
  const o = q.data;
  const a = o.acciones;
  const cerrada = o.estado === 'CERRADA';
  const momentos: MomentoFoto[] = a.cerrar || a.iniciar || a.reanudar || a.esperarRepuesto ? ['ANTES', 'DESPUES'] : ['REPORTE'];
  const faltantes = o.repuestos.filter((r) => r.faltante > 0);
  const costoTotal = o.costoRepuestos + o.costoManoObra + o.costoServiciosExternos;

  return (
    <>
      <PageHeader
        back={back}
        title={`${o.codigo} · ${o.activo.nombre}`}
        subtitle={<OrderBadges o={o} />}
      />

      {llegada?.reportada ? <div className="alert alert-ok">Falla reportada como {llegada.reportada}. El equipo de mantenimiento ya fue avisado.</div> : null}
      {llegada?.fotoFallo ? <div className="alert alert-warn">La foto no se pudo subir. Puede adjuntarla abajo.</div> : null}

      {(a.tomar || a.asignar || a.iniciar || a.esperarRepuesto || a.reanudar || a.cerrar || a.cancelar) ? (
        <div className="action-bar">
          {a.tomar ? <Button busy={tomar.isPending} onClick={() => tomar.mutate(user!.id)}><Icon name="wrench" /> Tomar esta orden</Button> : null}
          {a.iniciar ? <Button busy={simple.isPending} onClick={() => simple.mutate('iniciar')}>Iniciar trabajo</Button> : null}
          {a.reanudar ? <Button busy={simple.isPending} onClick={() => simple.mutate('reanudar')}>Reanudar trabajo</Button> : null}
          {a.cerrar ? <Button onClick={() => setModal('cerrar')}>Cerrar orden</Button> : null}
          {a.esperarRepuesto ? <Button variant="secondary" onClick={() => setModal('esperar')}>Esperar repuesto</Button> : null}
          {a.asignar ? <Button variant="secondary" onClick={() => setModal('asignar')}>{o.asignadoA ? 'Reasignar' : 'Asignar'}</Button> : null}
          {a.cancelar ? <Button variant="ghost" onClick={() => setModal('cancelar')}>Cancelar orden</Button> : null}
        </div>
      ) : null}
      {simple.isError ? <ErrorBox error={simple.error} /> : null}
      {tomar.isError ? <ErrorBox error={tomar.error} /> : null}

      <div className="grid-2">
        <section className="card">
          <h2>Detalle</h2>
          <p className="desc">{o.descripcion}</p>
          <div style={{ height: 14 }} />
          <KeyValue items={[
            ['Máquina', <Link to={`/maquinas/${o.activo.id}`}>{o.activo.codigo} · {o.activo.nombre}</Link>],
            ['Tipo', TIPO_LABEL[o.tipo]],
            ['Prioridad', PRIORIDAD_LABEL[o.prioridad]],
            ['Estado', ORDEN_ESTADO_LABEL[o.estado]],
            ['Técnico', o.asignadoA?.nombre ?? 'Sin asignar'],
            [o.tipo === 'PREVENTIVO' ? 'Programado para' : 'Reportado', o.tipo === 'PREVENTIVO' ? date(o.fechaProgramada) : `${dateTime(o.creadoEn)}${o.reportadoPor ? ` · ${o.reportadoPor.nombre}` : ''}`],
            ...(o.maquinaParada && o.inicioParada ? [['Tiempo parada', `${duration(o.inicioParada, o.finParada)}${o.finParada ? '' : ' (en curso)'}`] as [string, string]] : []),
            ...(o.plan ? [['Plan', o.plan.nombre] as [string, string]] : []),
          ]} />
          {o.motivoCancelacion ? <div className="alert alert-warn">Cancelada: {o.motivoCancelacion}</div> : null}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Repuestos</h2>
            {a.editarRepuestos ? <Button variant="ghost" onClick={() => setModal('repuestos')}><Icon name="edit" /> Editar</Button> : null}
          </div>
          {faltantes.length > 0 ? <div className="alert alert-warn">Faltan {faltantes.length} repuesto{faltantes.length === 1 ? '' : 's'} en bodega para esta orden.</div> : null}
          {o.repuestos.length === 0 ? <Empty title="Sin repuestos planificados" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Repuesto</th><th className="num">Planificado</th><th className="num">{cerrada ? 'Usado' : 'En bodega'}</th>{cerrada ? <th className="num">Costo</th> : null}</tr></thead>
                <tbody>
                  {o.repuestos.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Repuesto"><span className="code">{r.repuesto.codigo}</span> {r.repuesto.descripcion}</td>
                      <td data-label="Planificado" className="num">{qty(r.cantidadPlanificada)} {r.repuesto.unidad}</td>
                      {cerrada ? (
                        <>
                          <td data-label="Usado" className="num">{qty(r.cantidadUsada ?? 0)} {r.repuesto.unidad}</td>
                          <td data-label="Costo" className="num">{money((r.cantidadUsada ?? 0) * (r.costoUnitario ?? 0))}</td>
                        </>
                      ) : (
                        <td data-label="En bodega" className={`num ${r.faltante > 0 ? 'text-bad' : ''}`}>{qty(r.stock)}{r.faltante > 0 ? ` (faltan ${qty(r.faltante)})` : ''}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {cerrada ? (
          <section className="card span-2">
            <h2>Cierre</h2>
            <p className="desc">{o.trabajoRealizado}</p>
            <div style={{ height: 14 }} />
            <div className="stats" style={{ marginBottom: 12 }}>
              <div className="stat"><span>Repuestos</span><strong>{money(o.costoRepuestos)}</strong></div>
              <div className="stat"><span>Mano de obra</span><strong>{money(o.costoManoObra)}</strong></div>
              <div className="stat"><span>Servicios externos</span><strong>{money(o.costoServiciosExternos)}</strong></div>
              <div className="stat"><span>Total</span><strong>{money(costoTotal)}</strong></div>
            </div>
            <KeyValue items={[
              ['Cerrada', o.cerradaEn ? `${dateTime(o.cerradaEn)} · ${o.cerradaPor?.nombre ?? ''}` : '—'],
              ['Mano de obra', o.manoObra.length ? o.manoObra.map((m) => `${m.tecnico.nombre}: ${qty(m.horas)} h`).join(' · ') : 'No registrada'],
            ]} />
          </section>
        ) : null}

        <section className="card">
          <div className="card-head">
            <h2>Fotos</h2>
            {a.subirFotos ? (
              <div className="inline-filters">
                {momentos.length > 1 ? (
                  <Select value={momento} onChange={(e) => setMomento(e.target.value as MomentoFoto)} aria-label="Momento de la foto">
                    {momentos.map((m) => <option key={m} value={m}>{MOMENTO_LABEL[m]}</option>)}
                  </Select>
                ) : null}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={onFile} />
                <Button variant="secondary" busy={subir.isPending} onClick={() => { if (momentos.length === 1) setMomento(momentos[0]); fileRef.current?.click(); }}>
                  <Icon name="camera" /> Foto
                </Button>
              </div>
            ) : null}
          </div>
          {fotoError ? <div className="alert alert-bad">{fotoError}</div> : null}
          {o.fotos.length === 0 ? <Empty title="Sin fotos" /> : (
            <div className="photos">{o.fotos.map((f) => <Photo key={f.id} id={f.id} momento={f.momento} onOpen={setVisor} />)}</div>
          )}
        </section>

        <section className="card">
          <h2>Historial</h2>
          <ol className="timeline">
            {[...o.eventos].reverse().map((e) => (
              <li key={e.id}>
                <strong>{e.nota ?? ORDEN_ESTADO_LABEL[e.estadoNuevo]}</strong>
                <div className="muted">{dateTime(e.creadoEn)} · {e.usuario?.nombre ?? 'Sistema'}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <AssignModal o={o} open={modal === 'asignar'} onClose={() => setModal(null)} />
      <NoteModal o={o} kind="esperar" open={modal === 'esperar'} onClose={() => setModal(null)} />
      <NoteModal o={o} kind="cancelar" open={modal === 'cancelar'} onClose={() => setModal(null)} />
      <PlannedPartsModal o={o} open={modal === 'repuestos'} onClose={() => setModal(null)} />
      <CloseModal o={o} open={modal === 'cerrar'} onClose={() => setModal(null)} />
      <Modal open={!!visor} title="Foto" onClose={() => setVisor(null)}>
        {visor ? <img src={visor} alt="" style={{ width: '100%', borderRadius: 8 }} /> : null}
      </Modal>
    </>
  );
}
