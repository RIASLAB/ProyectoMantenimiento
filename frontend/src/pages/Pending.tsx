import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Empty, Icon, Modal, PageHeader } from '../components/ui';
import { dateTime } from '../format';
import type { OutboxItem } from '../offline/db';
import { descartar, reintentar, sincronizar, useEnLinea, usePendientes } from '../offline/outbox';

const TIPO: Record<OutboxItem['tipo'], string> = {
  reporte: 'Reporte de falla',
  temperatura: 'Temperatura',
  checklist: 'Checklist',
  'accion-orden': 'Orden de trabajo',
  'foto-orden': 'Foto de orden',
};

/** Registros guardados en este dispositivo que aún no llegan al servidor (OFF-03, OFF-05). */
export function Pending() {
  const { user } = useAuth();
  const enLinea = useEnLinea();
  const items = usePendientes(user?.id);
  const [enviando, setEnviando] = useState(false);
  const [borrar, setBorrar] = useState<OutboxItem | null>(null);
  const errores = items.filter((i) => i.estado === 'error');
  const pendientes = items.filter((i) => i.estado === 'pendiente');

  const enviarAhora = async () => {
    setEnviando(true);
    try { await sincronizar(user?.id); } finally { setEnviando(false); }
  };

  return (
    <>
      <PageHeader
        title="Pendientes de enviar"
        subtitle={enLinea ? 'Hay conexión: los pendientes se envían solos cada pocos segundos.' : 'Sin conexión: todo queda guardado en este dispositivo y se enviará al recuperar la señal.'}
        actions={pendientes.length && enLinea ? <Button busy={enviando} onClick={enviarAhora}><Icon name="upload" /> Enviar ahora</Button> : null}
      />
      {errores.length ? (
        <div className="alert alert-bad">
          {errores.length === 1 ? 'Un registro no se pudo aplicar' : `${errores.length} registros no se pudieron aplicar`}. Normalmente es porque otra persona ya cambió esa orden. Revise el motivo y descártelo o vuelva a intentarlo.
        </div>
      ) : null}
      {items.length === 0 ? (
        <Empty title="Todo está sincronizado"><p className="muted">No hay registros pendientes en este dispositivo.</p></Empty>
      ) : (
        <ul className="list">
          {items.map((i) => (
            <li key={i.id} className="list-row static">
              <div className="list-main">
                <span className="code">{TIPO[i.tipo]}</span>
                <strong>{i.resumen}</strong>
                <span className="muted small">Registrado {dateTime(new Date(i.creadoEn).toISOString())}{i.intentos ? ` · ${i.intentos} intento${i.intentos === 1 ? '' : 's'}` : ''}</span>
                {i.error ? <span className="text-bad small">{i.error}</span> : null}
                {i.ordenId ? <Link to={`/ordenes/${i.ordenId}`} className="small">Ver la orden</Link> : null}
              </div>
              <div className="list-meta">
                {i.estado === 'error' ? <Badge tone="bad">No se aplicó</Badge> : <Badge tone="warn">Por enviar</Badge>}
                {i.estado === 'error' ? (
                  <div className="row-actions">
                    <Button variant="ghost" onClick={() => reintentar(i.id!, user!.id)}>Reintentar</Button>
                    <Button variant="ghost" onClick={() => setBorrar(i)}>Descartar</Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!borrar} title="Descartar registro" onClose={() => setBorrar(null)}
        footer={<><Button variant="ghost" onClick={() => setBorrar(null)}>Volver</Button><Button variant="danger" onClick={async () => { await descartar(borrar!.id!); setBorrar(null); }}>Descartar</Button></>}>
        <p style={{ margin: 0 }}>Se borrará de este dispositivo y no llegará al sistema: <strong>{borrar?.resumen}</strong></p>
      </Modal>
    </>
  );
}
