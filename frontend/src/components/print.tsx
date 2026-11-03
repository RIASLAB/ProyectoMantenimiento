import { useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { FormatoDocumental } from '../api/types';
import { date } from '../format';
import { Button, ErrorBox, Icon, Spinner } from './ui';

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
