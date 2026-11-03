import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PointerEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { FormatoDocumental } from '../api/types';
import { date } from '../format';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBox, Field, Icon, Input, Modal, Spinner } from './ui';

/** Códigos y versiones de los formatos impresos (configurables en Ajustes). */
export function useFormatos() {
  return useQuery({ queryKey: ['parametros', 'formatos'], queryFn: () => api.get<Record<string, FormatoDocumental>>('/parametros/formatos'), staleTime: 300_000 });
}

/**
 * Hoja imprimible de un formato. La barra de arriba (volver, controles, imprimir) no sale en el papel;
 * "Imprimir" abre el diálogo del navegador, donde también se puede guardar como PDF.
 */
export function PrintPage({ titulo, controles, children, loading, error, horizontal }: {
  titulo: string; controles?: ReactNode; children?: ReactNode; loading?: boolean; error?: unknown; horizontal?: boolean;
}) {
  const nav = useNavigate();
  useEffect(() => {
    const previo = document.title;
    document.title = titulo;
    return () => { document.title = previo; };
  }, [titulo]);
  return (
    <div className={`print-root ${horizontal ? 'print-landscape' : ''}`}>
      {horizontal ? <style>{'@page { size: letter landscape; margin: 8mm; }'}</style> : <style>{'@page { size: letter; margin: 10mm; }'}</style>}
      <div className="print-toolbar no-print">
        <Button variant="ghost" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}><Icon name="back" size={18} /> Volver</Button>
        <div className="print-controls">{controles}</div>
        <Button onClick={() => window.print()} disabled={loading || !!error}><Icon name="download" /> Imprimir / PDF</Button>
      </div>
      {loading ? <Spinner /> : error ? <div className="print-error"><ErrorBox error={error} /></div> : <div className="print-sheet">{children}</div>}
    </div>
  );
}

/** Encabezado de los formatos de la planta: logo, título y control documental (código, versión, fechas). */
export function FormatHeader({ titulo, formato, extra }: { titulo: string; formato?: Partial<FormatoDocumental> | null; extra?: ReactNode }) {
  return (
    <table className="fh">
      <tbody>
        <tr>
          <td className="fh-logo" rowSpan={4}><img src="/logo-formato.png" alt="Nutrialimentos Cárnicos" /></td>
          <td className="fh-title" rowSpan={4}>{titulo}</td>
          <td className="fh-meta">CÓDIGO: <strong>{formato?.codigo || '—'}</strong></td>
        </tr>
        <tr><td className="fh-meta">VERSIÓN: <strong>{formato?.version || '—'}</strong></td></tr>
        <tr><td className="fh-meta">FECHA DE ELABORACIÓN: {formato?.fechaElaboracion ? date(formato.fechaElaboracion) : '—'}</td></tr>
        <tr><td className="fh-meta">FECHA DE ACTUALIZACIÓN: {formato?.fechaActualizacion ? date(formato.fechaActualizacion) : '—'}{extra}</td></tr>
      </tbody>
    </table>
  );
}

/** Casilla marcada o vacía, como en el papel. */
export const Marca = ({ on }: { on: boolean }) => <span className={`pmark ${on ? 'on' : ''}`} aria-label={on ? 'Marcado' : 'Sin marcar'}>{on ? 'X' : ''}</span>;

/** Línea de firma con el nombre debajo (el nombre que registra el sistema, si lo hay). */
export function Firma({ cargo, nombre }: { cargo: string; nombre?: string | null }) {
  return (
    <div className="pfirma">
      <div className="pfirma-linea">{nombre ?? ''}</div>
      <div className="pfirma-cargo">{cargo}</div>
    </div>
  );
}

/** Aviso al pie: de dónde salió el documento y cuándo. */
export function PieSistema() {
  return <p className="ppie">Generado por el sistema de mantenimiento el {new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}.</p>;
}

// ======================= Firmas hechas en la pantalla =======================

export type EntidadFirma = 'OT' | 'CHECKLIST' | 'PLANILLA' | 'ILUMINACION';
interface FirmaInfo { id: string; casilla: string; nombre: string; cargo: string | null; imagen: string; creadoEn: string; usuarioId: string }

export function useFirmas(entidad: EntidadFirma, entidadId: string | undefined) {
  return useQuery({
    queryKey: ['firmas', entidad, entidadId],
    queryFn: () => api.get<FirmaInfo[]>(`/firmas?entidad=${entidad}&entidadId=${encodeURIComponent(entidadId!)}`),
    enabled: !!entidadId,
  });
}

/** Panel para firmar con el dedo o el lápiz; entrega la firma como PNG. */
function PanelFirma({ onCambio }: { onCambio: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const trazos = useRef(0);
  const ctx = () => {
    const c = ref.current!.getContext('2d')!;
    c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#0b1f4d';
    return c;
  };
  const punto = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * ref.current!.width) / r.width, y: ((e.clientY - r.top) * ref.current!.height) / r.height };
  };
  const limpiar = () => {
    ctx().clearRect(0, 0, ref.current!.width, ref.current!.height);
    trazos.current = 0;
    onCambio(null);
  };
  return (
    <div className="firma-panel">
      <canvas ref={ref} width={600} height={220} className="firma-canvas" aria-label="Espacio para firmar"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dibujando.current = true; const p = punto(e); const c = ctx(); c.beginPath(); c.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!dibujando.current) return; const p = punto(e); const c = ctx(); c.lineTo(p.x, p.y); c.stroke(); trazos.current += 1; }}
        onPointerUp={() => { dibujando.current = false; if (trazos.current > 3) onCambio(ref.current!.toDataURL('image/png')); }}
        onPointerCancel={() => { dibujando.current = false; }} />
      <div className="firma-pie"><span className="muted small">Firme dentro del recuadro</span><button type="button" className="link-btn" onClick={limpiar}>Borrar</button></div>
    </div>
  );
}

/**
 * Casilla de firma de un formato: si ya se firmó muestra la firma con el nombre; si no, la línea vacía
 * y (solo en pantalla) el botón para firmar. Las firmas no se pueden cambiar.
 */
export function FirmaCasilla({ entidad, entidadId, casilla, cargo, nombre, soloJefe }: {
  entidad: EntidadFirma; entidadId: string; casilla: string; cargo: string; nombre?: string | null; soloJefe?: boolean;
}) {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const firmas = useFirmas(entidad, entidadId);
  const f = firmas.data?.find((x) => x.casilla === casilla);
  const [abierto, setAbierto] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [quien, setQuien] = useState('');
  const m = useMutation({
    mutationFn: () => api.post('/firmas', { entidad, entidadId, casilla, nombre: quien, cargo, imagen: png }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['firmas', entidad, entidadId] }); qc.invalidateQueries({ queryKey: ['bitacora'] }); setAbierto(false); },
  });
  const puede = !soloJefe || can('ADMIN', 'AUTORIZADOR');
  // Firma quien tiene la sesión; si firma otra persona (ej. el líder de área) escribe su nombre.
  const abrir = () => { m.reset(); setPng(null); setQuien(user?.nombre ?? ''); setAbierto(true); };
  return (
    <div className="pfirma">
      <div className="pfirma-linea">
        {f ? <img className="pfirma-img" src={f.imagen} alt={`Firma de ${f.nombre}`} /> : null}
        <span>{f ? f.nombre : nombre ?? ''}</span>
      </div>
      <div className="pfirma-cargo">{cargo}</div>
      {f ? <div className="pfirma-fecha">{new Date(f.creadoEn).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</div>
        : puede && !firmas.isPending ? <button type="button" className="btn btn-ghost no-print pfirma-btn" onClick={abrir}><Icon name="edit" size={16} /> Firmar</button> : null}
      <Modal open={abierto} title={`Firmar: ${cargo}`} onClose={() => setAbierto(false)}
        footer={<><Button variant="ghost" type="button" onClick={() => setAbierto(false)}>Cancelar</Button><Button busy={m.isPending} disabled={!png || quien.trim().length < 3} onClick={() => m.mutate()}>Guardar firma</Button></>}>
        <div className="stack">
          <Field label="Nombre de quien firma *">{(i) => <Input id={i} value={quien} onChange={(e) => setQuien(e.target.value)} maxLength={120} />}</Field>
          {abierto ? <PanelFirma onCambio={setPng} /> : null}
          <p className="muted small" style={{ margin: 0 }}>La firma queda guardada con la fecha y el usuario de esta sesión, y no se puede cambiar.</p>
          {m.isError ? <ErrorBox error={m.error} /> : null}
        </div>
      </Modal>
    </div>
  );
}
