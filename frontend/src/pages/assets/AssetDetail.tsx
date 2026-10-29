import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, openProtectedFile } from '../../api/client';
import type { Asset, AssetDocument, AssetHistory, EquipmentModel } from '../../api/types';
import { TipoModal } from './EquipmentTypes';
import { OrderStateBadge } from '../../components/orders-shared';
import { InstallModal } from '../../components/InstallModal';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Empty, ErrorBox, Icon, KeyValue, Modal, PageHeader, Spinner } from '../../components/ui';
import { date, dateTime, daysUntil, ESTADO_LABEL, ESTADO_TONE, fileSize, money, qty, TIPO_LABEL } from '../../format';

const MAX_MB = 20;

/** Hoja de vida (ACT-03) y costo acumulado (ACT-04). */
function Historial({ activoId }: { activoId: string }) {
  const { can } = useAuth();
  const h = useQuery({ queryKey: ['historial', activoId], queryFn: () => api.get<AssetHistory>(`/activos/${activoId}/historial`) });
  const verCostos = can('ADMIN', 'AUTORIZADOR');
  return (
    <>
      <h2>Hoja de vida</h2>
      {h.isPending ? <Spinner /> : h.isError ? <ErrorBox error={h.error} /> : (
        <>
          {verCostos ? (
            <div className="stats">
              <div className="stat"><span>Costo acumulado</span><strong>{money(h.data.costos.total)}</strong></div>
              <div className="stat"><span>Repuestos</span><strong>{money(h.data.costos.repuestos)}</strong></div>
              <div className="stat"><span>Mano de obra</span><strong>{money(h.data.costos.manoObra)}</strong></div>
              <div className="stat"><span>Servicios externos</span><strong>{money(h.data.costos.externos)}</strong></div>
            </div>
          ) : null}
          <p className="muted">{h.data.cerradas.correctivos} correctivo{h.data.cerradas.correctivos === 1 ? '' : 's'} y {h.data.cerradas.preventivos} preventivo{h.data.cerradas.preventivos === 1 ? '' : 's'} realizados.</p>
          {h.data.ordenes.length === 0 ? <Empty title="Esta máquina aún no tiene órdenes de trabajo" /> : (
            <ul className="list">
              {h.data.ordenes.map((o) => (
                <li key={o.id}>
                  <Link to={`/ordenes/${o.id}`} className="list-row">
                    <div className="list-main">
                      <span className="code">{o.codigo} · {TIPO_LABEL[o.tipo]}</span>
                      <span className="clamp">{o.descripcion}</span>
                      <span className="muted small">{dateTime(o.creadoEn)}{o.asignadoA ? ` · ${o.asignadoA.nombre}` : ''}</span>
                    </div>
                    <div className="list-meta" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <OrderStateBadge estado={o.estado} />
                      {verCostos && o.estado === 'CERRADA' ? <span className="muted small">{money(o.costoTotal ?? 0)}</span> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
const ACCEPT = 'application/pdf,image/jpeg,image/png';

function Garantia({ fecha }: { fecha: string | null }) {
  if (!fecha) return <>—</>;
  const d = daysUntil(fecha);
  if (d < 0) return <>{date(fecha)} <Badge tone="muted">Vencida</Badge></>;
  if (d <= 60) return <>{date(fecha)} <Badge tone="warn">Vence en {d} días</Badge></>;
  return <>{date(fecha)} <Badge tone="ok">Vigente</Badge></>;
}

/** Edita la lista de materiales del tipo de la máquina sin salir de su ficha. */
function ListaMaterialesModal({ modeloId, open, onClose }: { modeloId: string; open: boolean; onClose: () => void }) {
  const t = useQuery({ queryKey: ['tipo-equipo', modeloId], queryFn: () => api.get<EquipmentModel>(`/tipos-equipo/${modeloId}`), enabled: open });
  return <TipoModal tipo={t.data ?? null} open={open && !!t.data} onClose={onClose} />;
}

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const [openError, setOpenError] = useState('');
  const [aBorrar, setABorrar] = useState<AssetDocument | null>(null);
  const [instalar, setInstalar] = useState(false);
  const [editarLista, setEditarLista] = useState(false);

  const q = useQuery({ queryKey: ['activo', id], queryFn: () => api.get<Asset>(`/activos/${id}`) });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('archivo', file);
      return api.post(`/activos/${id}/documentos`, fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activo', id] }),
    onError: (e) => setUploadError(e.message),
  });

  const borrar = useMutation({
    mutationFn: (docId: string) => api.delete(`/activos/documentos/${docId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activo', id] }); setABorrar(null); },
  });
  const cerrarBorrar = () => { setABorrar(null); borrar.reset(); };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setUploadError('');
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) return setUploadError('Solo se permiten archivos PDF, JPG o PNG');
    if (f.size > MAX_MB * 1024 * 1024) return setUploadError(`El archivo supera ${MAX_MB} MB`);
    upload.mutate(f);
  };

  const back = (
    <Link to="/maquinas" className="back-link">
      <Icon name="back" size={18} /> Máquinas
    </Link>
  );

  if (q.isPending) return <Spinner />;
  if (q.isError) return <>{back}<ErrorBox error={q.error} onRetry={() => q.refetch()} /></>;
  const a = q.data;
  const docs = a.documentos ?? [];

  return (
    <>
      <PageHeader
        back={back}
        title={a.nombre}
        subtitle={<><span className="code">{a.codigo}</span> <Badge tone={ESTADO_TONE[a.estado]}>{ESTADO_LABEL[a.estado]}</Badge></>}
        actions={
          <>
            {a.estado === 'EN_BODEGA' && can('ADMIN') ? (
              <Button onClick={() => setInstalar(true)}><Icon name="wrench" /> Instalar</Button>
            ) : null}
            {a.estado !== 'DADO_DE_BAJA' && a.estado !== 'EN_BODEGA' ? (
              <Link to={`/ordenes/reportar?activo=${a.id}`} className="btn btn-primary">
                <Icon name="alert" /> Reportar falla
              </Link>
            ) : null}
            {can('ADMIN') ? (
              <Link to={`/maquinas/${a.id}/editar`} className="btn btn-secondary">
                <Icon name="edit" /> Editar
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid-2">
        <section className="card">
          <h2>Ficha técnica</h2>
          <KeyValue
            items={[
              ['Tipo de equipo', a.modeloEquipo ? <Link to={`/maquinas?modeloId=${a.modeloEquipo.id}`}>{a.modeloEquipo.categoria?.nombre} · {a.modeloEquipo.nombre}</Link> : 'Sin tipo'],
              ['Fabricante', a.fabricante],
              ['Modelo', a.modelo],
              ['N.° de serie', a.serie],
              ['Código SAP', a.codigoSap],
              ['Área', a.area],
              ['Ubicación', a.ubicacion],
              ['Fecha de compra', date(a.fechaCompra)],
              ['Garantía hasta', <Garantia fecha={a.fechaFinGarantia} />],
            ]}
          />
          {a.notas ? <p className="notes">{a.notas}</p> : null}
          {a.modeloEquipo ? (
            <div className="materiales">
              <div className="materiales-head">
                <p className="subtle-head">Lista de materiales · {a.modeloEquipo.nombre}</p>
                {can('ADMIN') ? <Button variant="ghost" onClick={() => setEditarLista(true)}><Icon name="edit" /> Editar lista</Button> : null}
              </div>
              {a.modeloEquipo.materiales?.length ? (
                <ul>
                  {a.modeloEquipo.materiales.map((m) => (
                    <li key={m.repuestoId}><Link to={`/inventario/${m.repuesto.id}`}><strong>{m.repuesto.codigo}</strong> {m.repuesto.descripcion}</Link> <span className="muted">× {qty(m.cantidad)} {m.repuesto.unidad}</span></li>
                  ))}
                </ul>
              ) : <p className="muted small" style={{ margin: 0 }}>El tipo aún no tiene lista de materiales.</p>}
              {can('ADMIN') ? <p className="muted small" style={{ margin: '.25rem 0 0' }}>Los cambios aplican a todas las máquinas de este tipo.</p> : null}
            </div>
          ) : (
            <div className="materiales">
              <p className="subtle-head">Lista de materiales</p>
              <p className="muted small" style={{ margin: 0 }}>
                Esta máquina no tiene tipo de equipo.{can('ADMIN') ? <> Asígnele uno en <Link to={`/maquinas/${a.id}/editar`}>Editar</Link> para tener su lista de materiales.</> : null}
              </p>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Manuales y documentos</h2>
            {can('ADMIN') ? (
              <>
                <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFile} />
                <Button variant="secondary" busy={upload.isPending} onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" /> Adjuntar
                </Button>
              </>
            ) : null}
          </div>
          {uploadError ? <div className="alert alert-bad">{uploadError}</div> : null}
          {openError ? <div className="alert alert-bad">{openError}</div> : null}
          {docs.length === 0 ? (
            <Empty title="Sin documentos adjuntos">
              {can('ADMIN') ? <p className="muted">PDF, JPG o PNG de hasta {MAX_MB} MB.</p> : null}
            </Empty>
          ) : (
            <ul className="docs">
              {docs.map((d) => (
                <li key={d.id} className="doc-row">
                  <button
                    className="doc"
                    onClick={() => {
                      setOpenError('');
                      openProtectedFile(`/activos/documentos/${d.id}/archivo`, d.nombreOriginal).catch((e) => setOpenError(e.message));
                    }}
                  >
                    <Icon name="file" />
                    <span className="doc-name">{d.nombreOriginal}</span>
                    <span className="muted">
                      {fileSize(d.tamanoBytes)} · {d.subidoPor?.nombre ?? '—'} · {dateTime(d.creadoEn)}
                    </span>
                  </button>
                  {can('ADMIN') ? (
                    <button type="button" className="icon-btn doc-del" aria-label={`Eliminar ${d.nombreOriginal}`} onClick={() => setABorrar(d)}>
                      <Icon name="trash" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card span-2">
          <Historial activoId={a.id} />
        </section>
      </div>
      <InstallModal equipo={instalar ? a : null} onClose={() => setInstalar(false)} />
      {a.modeloEquipo ? <ListaMaterialesModal modeloId={a.modeloEquipo.id} open={editarLista} onClose={() => setEditarLista(false)} /> : null}
      <Modal open={!!aBorrar} title="Eliminar documento" onClose={cerrarBorrar}
        footer={<><Button variant="ghost" onClick={cerrarBorrar}>Cancelar</Button><Button variant="danger" busy={borrar.isPending} onClick={() => aBorrar && borrar.mutate(aBorrar.id)}>Eliminar</Button></>}>
        <p style={{ marginTop: 0 }}>¿Eliminar <strong>{aBorrar?.nombreOriginal}</strong> de esta máquina?</p>
        <p className="muted small" style={{ margin: 0 }}>Quedará registrado en la bitácora.</p>
        {borrar.isError ? <ErrorBox error={borrar.error} /> : null}
      </Modal>
    </>
  );
}
