import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ApiError, uuid } from '../../api/client';
import type { MomentoFoto, PersonRef, Purchase, WorkOrderDetail } from '../../api/types';
import { NewPurchaseModal } from '../purchases/NewPurchaseModal';
import { db } from '../../offline/db';
import { comprimirFoto, enviarOEncolar, usePendientes } from '../../offline/outbox';
import { useAuth } from '../../auth/AuthContext';
import { OrderBadges, PartRow, PartRows, rowsToPayload, useProtectedImage, useTipoEquipo } from '../../components/orders-shared';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, KeyValue, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { COMPRA_ESTADO_LABEL, COMPRA_ESTADO_TONE, date, dateTime, duration, money, ORDEN_ESTADO_LABEL, PRIORIDAD_LABEL, qty, TIPO_LABEL, toLocalInput } from '../../format';

type ModalKind = 'asignar' | 'esperar' | 'cerrar' | 'cancelar' | 'repuestos' | 'compra' | null;
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
      qc.invalidateQueries({ queryKey: ['compras'] });
      onDone?.();
    },
  });
}

type Accion = 'iniciar' | 'esperar-repuesto' | 'reanudar' | 'cerrar';
type Acciones = WorkOrderDetail['acciones'];
const SIGUIENTE: Record<Accion, { estado: WorkOrderDetail['estado']; acciones: Partial<Acciones>; texto: string }> = {
  iniciar: { estado: 'EN_EJECUCION', acciones: { iniciar: false, esperarRepuesto: true, cerrar: true, reanudar: false }, texto: 'Iniciar trabajo' },
  'esperar-repuesto': { estado: 'ESPERANDO_REPUESTO', acciones: { esperarRepuesto: false, cerrar: false, reanudar: true }, texto: 'Pausar: esperando repuesto' },
  reanudar: { estado: 'EN_EJECUCION', acciones: { reanudar: false, esperarRepuesto: true, cerrar: true }, texto: 'Reanudar trabajo' },
  cerrar: {
    estado: 'CERRADA',
    acciones: { asignar: false, tomar: false, iniciar: false, esperarRepuesto: false, reanudar: false, cerrar: false, cancelar: false, editarRepuestos: false, subirFotos: false },
    texto: 'Cerrar orden',
  },
};

/**
 * Acciones del técnico sobre la OT con soporte sin conexión (OFF-01): si no hay señal, la acción queda guardada
 * y la pantalla muestra el nuevo estado de inmediato, para poder seguir (p. ej. iniciar y luego cerrar).
 */
function useAccionOT(orden: WorkOrderDetail | undefined, onDone?: () => void) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ accion, body }: { accion: Accion; body?: object }) => {
      const o = orden!;
      const r = await enviarOEncolar(
        { usuarioId: user!.id, tipo: 'accion-orden', resumen: `${o.codigo}: ${SIGUIENTE[accion].texto}`, method: 'POST', path: `/ordenes/${o.id}/${accion}`, body, ordenId: o.id },
        // Al cerrar sin señal, el servidor registra el consumo aunque falte stock (D-02).
        (b) => (accion === 'cerrar' ? { ...(b as object), registradoSinConexion: true } : b),
      );
      return { ...r, accion };
    },
    onSuccess: async (r) => {
      const o = orden!;
      if (r.encolado) {
        const key = `/ordenes/${o.id}`;
        const sig = SIGUIENTE[r.accion];
        const nuevo = (d: WorkOrderDetail | undefined) => d && { ...d, estado: sig.estado, acciones: { ...d.acciones, ...sig.acciones } };
        qc.setQueryData(['orden', o.id], nuevo);
        const c = await db.cache.get(key);
        if (c) await db.cache.put({ ...c, data: nuevo(c.data as WorkOrderDetail) });
      } else {
        qc.invalidateQueries({ queryKey: ['orden', o.id] });
      }
      qc.invalidateQueries({ queryKey: ['ordenes'] });
      qc.invalidateQueries({ queryKey: ['ordenes-resumen'] });
      qc.invalidateQueries({ queryKey: ['activos'] });
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
  const cancelarM = useOrderMutation(o.id, () => api.post(`/ordenes/${o.id}/cancelar`, { motivo: texto }), () => { setTexto(''); onClose(); });
  const esperarM = useAccionOT(o, () => { setTexto(''); onClose(); });
  const m = kind === 'esperar'
    ? { ...esperarM, mutate: () => esperarM.mutate({ accion: 'esperar-repuesto', body: { nota: texto || undefined } }) }
    : cancelarM;
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
  const tipo = useTipoEquipo(open ? o.activo.modeloId : null);
  useEffect(() => { if (open) setRows(o.repuestos.map((r) => ({ repuestoId: r.repuestoId, cantidad: String(r.cantidadPlanificada) }))); }, [open, o.repuestos]);
  const m = useOrderMutation(o.id, () => api.put(`/ordenes/${o.id}/repuestos`, { repuestos: rowsToPayload(rows) }), onClose);
  return (
    <Modal open={open} title="Repuestos planificados" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button busy={m.isPending} onClick={() => m.mutate(undefined)}>Guardar</Button></>}>
      <div className="stack">
        <PartRows rows={rows} onChange={setRows} sugeridos={tipo.data?.materiales} tituloSugeridos={tipo.data ? `Lista de materiales · ${tipo.data.nombre}` : undefined} />
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </div>
    </Modal>
  );
}

function CloseModal({ o, open, onClose }: { o: WorkOrderDetail; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const tipo = useTipoEquipo(open ? o.activo.modeloId : null);
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

  const [clientId] = useState(() => uuid());
  const accion = useAccionOT(o, onClose);
  const m = { ...accion, mutate: () => accion.mutate({ accion: 'cerrar', body: {
      trabajoRealizado: trabajo,
      repuestosUsados: rowsToPayload(rows),
      manoObra: labor.filter((l) => l.tecnicoId && Number(l.horas) > 0).map((l) => ({ tecnicoId: l.tecnicoId, horas: Number(l.horas) })),
      costoServiciosExternos: externos ? Number(externos) : undefined,
      // Si no se cambió la hora sugerida, se envía el momento exacto (con segundos).
      finParada: o.maquinaParada ? (fin === finInicial ? new Date() : new Date(fin)).toISOString() : undefined,
      cerradaEn: new Date().toISOString(),
      clientId,
    } }) };

  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

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
          <PartRows rows={rows} onChange={setRows} sugeridos={tipo.data?.materiales} tituloSugeridos={tipo.data ? `Lista de materiales · ${tipo.data.nombre}` : undefined} />
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

type Foto = WorkOrderDetail['fotos'][number];

function Photo({ foto, onOpen }: { foto: Foto; onOpen: (v: { foto: Foto; url: string }) => void }) {
  const { id, momento } = foto;
  const url = useProtectedImage(`/ordenes/fotos/${id}/archivo`);
  return (
    <button type="button" className="photo" onClick={() => url && onOpen({ foto, url })} aria-label={`Foto ${MOMENTO_LABEL[momento]}`}>
      {url ? <img src={url} alt="" /> : <span className="spinner sm" />}
      <span><Badge tone="muted">{MOMENTO_LABEL[momento]}</Badge></span>
    </button>
  );
}

/**
 * Foto en grande. Quien la subió o un administrador puede eliminarla mientras la orden está abierta
 * (cerrada, las fotos son evidencia del trabajo). La API valida lo mismo.
 */
function PhotoViewer({ o, visor, onClose }: { o: WorkOrderDetail; visor: { foto: Foto; url: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const [confirmar, setConfirmar] = useState(false);
  const foto = visor?.foto;
  const abierta = o.estado !== 'CERRADA' && o.estado !== 'CANCELADA';
  const puede = !!foto && abierta && (can('ADMIN') || foto.subidoPor?.id === user?.id);
  const m = useMutation({
    mutationFn: () => api.delete(`/ordenes/fotos/${foto!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orden', o.id] }); cerrar(); },
  });
  function cerrar() { setConfirmar(false); m.reset(); onClose(); }
  const error = m.error instanceof ApiError && m.error.status === 0 ? new Error('Para eliminar la foto se necesita conexión.') : m.error;

  return (
    <Modal open={!!visor} title={foto ? `Foto · ${MOMENTO_LABEL[foto.momento]}` : 'Foto'} onClose={cerrar}
      footer={puede ? (confirmar ? (
        <>
          <Button variant="ghost" onClick={() => setConfirmar(false)}>No, conservarla</Button>
          <Button variant="danger" busy={m.isPending} onClick={() => m.mutate()}>Sí, eliminar</Button>
        </>
      ) : (
        <Button variant="ghost" className="text-bad" onClick={() => setConfirmar(true)}><Icon name="trash" /> Eliminar foto</Button>
      )) : undefined}>
      {visor ? <img src={visor.url} alt="" style={{ width: '100%', borderRadius: 8 }} /> : null}
      {foto ? <p className="muted small" style={{ margin: '8px 0 0' }}>{foto.subidoPor?.nombre ?? '—'} · {dateTime(foto.creadoEn)}</p> : null}
      {confirmar ? <div className="alert alert-warn" style={{ marginTop: 10 }}>¿Eliminar esta foto? Quedará registrado en el historial de la orden.</div> : null}
      {m.isError ? <ErrorBox error={error} /> : null}
    </Modal>
  );
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const verCompras = can('ADMIN', 'AUTORIZADOR', 'TECNICO');
  const compras = useQuery({ queryKey: ['compras', 'orden', id], queryFn: () => api.get<Purchase[]>(`/compras?ordenId=${id}`), enabled: verCompras });
  const [modal, setModal] = useState<ModalKind>(null);
  const [visor, setVisor] = useState<{ foto: Foto; url: string } | null>(null);
  const [momento, setMomento] = useState<MomentoFoto>('ANTES');
  const [fotoError, setFotoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const llegada = location.state as { reportada?: string; fotoFallo?: boolean } | null;

  const q = useQuery({ queryKey: ['orden', id], queryFn: () => api.get<WorkOrderDetail>(`/ordenes/${id}`) });
  const pendientesOT = usePendientes(user?.id).filter((i) => i.ordenId === id);
  const simple = useAccionOT(q.data);
  const tomar = useOrderMutation<string>(id!, (me) => api.post(`/ordenes/${id}/asignar`, { tecnicoId: me }));

  const subir = useMutation({
    mutationFn: async (f: File) => {
      if (!['image/jpeg', 'image/png'].includes(f.type)) throw new Error('La foto debe ser JPG o PNG');
      const blob = await comprimirFoto(f);
      return enviarOEncolar({
        usuarioId: user!.id, tipo: 'foto-orden', resumen: `Foto (${momento.toLowerCase()}) de la orden`, method: 'POST',
        path: `/ordenes/${id}/fotos`, ordenId: id, foto: { blob, nombre: 'foto.jpg', momento, clientId: uuid() },
      });
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
      {pendientesOT.length ? (
        <div className="alert alert-warn">
          <span>
            <strong>Guardado en este dispositivo, sin enviar:</strong> {pendientesOT.map((p) => p.resumen.replace(`${o.codigo}: `, '')).join(' · ')}.
            {' '}Se enviará{pendientesOT.length === 1 ? '' : 'n'} al recuperar la señal. <Link to="/pendientes">Ver pendientes</Link>
          </span>
        </div>
      ) : null}

      {(a.tomar || a.asignar || a.iniciar || a.esperarRepuesto || a.reanudar || a.cerrar || a.cancelar) ? (
        <div className="action-bar">
          {a.tomar ? <Button busy={tomar.isPending} onClick={() => tomar.mutate(user!.id)}><Icon name="wrench" /> Tomar esta orden</Button> : null}
          {a.iniciar ? <Button busy={simple.isPending} onClick={() => simple.mutate({ accion: 'iniciar' })}>Iniciar trabajo</Button> : null}
          {a.reanudar ? <Button busy={simple.isPending} onClick={() => simple.mutate({ accion: 'reanudar' })}>Reanudar trabajo</Button> : null}
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

        {verCompras && (compras.data?.length || (a.editarRepuestos && can('ADMIN', 'TECNICO'))) ? (
          <section className="card span-2">
            <div className="card-head">
              <h2>Compras de repuestos</h2>
              {a.editarRepuestos && can('ADMIN', 'TECNICO') ? <Button variant="ghost" onClick={() => setModal('compra')}><Icon name="cart" /> Solicitar compra</Button> : null}
            </div>
            {!compras.data?.length ? <p className="muted" style={{ margin: 0 }}>Sin solicitudes. Si faltan repuestos planificados, la solicitud se crea automáticamente.</p> : (
              <ul className="list">
                {compras.data.map((c) => (
                  <li key={c.id}>
                    <Link to={`/compras/${c.id}`} className="list-row">
                      <div className="list-main">
                        <span className="code">{c.codigo}</span>
                        <strong>{qty(c.cantidad)} {c.repuesto.unidad} · {c.repuesto.descripcion}</strong>
                      </div>
                      <Badge tone={COMPRA_ESTADO_TONE[c.estado]}>{COMPRA_ESTADO_LABEL[c.estado]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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
            <div className="photos">{o.fotos.map((f) => <Photo key={f.id} foto={f} onOpen={setVisor} />)}</div>
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
      <NewPurchaseModal open={modal === 'compra'} onClose={() => setModal(null)} ordenId={o.id} ordenCodigo={o.codigo} />
      <PhotoViewer o={o} visor={visor} onClose={() => setVisor(null)} />
    </>
  );
}
