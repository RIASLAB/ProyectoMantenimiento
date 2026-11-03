import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Asset, Plan } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useProtectedImage } from '../../components/orders-shared';
import { FormatHeader, Marca, PieSistema, PrintPage, useFormatos } from '../../components/print';
import { date, ESTADO_LABEL, frecuencia, qty } from '../../format';

function FotoEquipo({ docId }: { docId: string }) {
  const url = useProtectedImage(`/activos/documentos/${docId}/archivo`);
  return url ? <img className="pfoto" src={url} alt="Foto del equipo" /> : null;
}

/** Hoja de vida de maquinaria y equipos en el formato AC-PMT-FR05. */
export function PrintAssetSheet() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const a = useQuery({ queryKey: ['activo', id], queryFn: () => api.get<Asset>(`/activos/${id}`) });
  const planes = useQuery({ queryKey: ['planes', 'activo', id], queryFn: () => api.get<Plan[]>(`/planes?activoId=${id}`), enabled: can('ADMIN', 'AUTORIZADOR', 'TECNICO') });
  const f = useFormatos();
  const d = a.data;
  const manuales = d?.documentos?.filter((x) => x.mime === 'application/pdf') ?? [];
  const foto = d?.documentos?.find((x) => x.mime.startsWith('image/'));
  const tieneManual = manuales.length > 0 || !!d?.ubicacionManual;
  const vigentes = (planes.data ?? []).filter((p) => p.vigente);
  const materiales = new Map<string, { codigo: string; descripcion: string; unidad: string }>();
  for (const p of vigentes) for (const r of p.repuestos) materiales.set(r.repuesto.id, r.repuesto);
  for (const m of d?.modeloEquipo?.materiales ?? []) materiales.set(m.repuesto.id, m.repuesto);
  const v = (x: string | null | undefined) => x || '';

  return (
    <PrintPage titulo={d ? `Hoja de vida ${d.codigo}` : 'Hoja de vida'} loading={a.isPending || f.isPending} error={a.error}>
      {d ? (
        <>
          <FormatHeader titulo="Hoja de vida de maquinaria y equipos" formato={f.data?.HOJA_VIDA} />
          <table>
            <tbody>
              <tr><td colSpan={3}><span className="plabel">NOMBRE DEL EQUIPO O MAQUINARIA:</span> {d.nombre}</td></tr>
              <tr><td colSpan={3}><span className="plabel">DESCRIPCIÓN:</span> {[d.modeloEquipo ? `${d.modeloEquipo.categoria?.nombre ?? ''} · ${d.modeloEquipo.nombre}` : null, d.notas].filter(Boolean).join('. ')}</td></tr>
              <tr>
                <td colSpan={2}><span className="plabel">ÁREA DEL EQUIPO:</span> {d.area}</td>
                <td><span className="plabel">UBICACIÓN:</span> {v(d.ubicacion)}</td>
              </tr>
              <tr>
                <td><span className="plabel">CÓDIGO INVENTARIO:</span> {d.codigo}{d.codigoSap ? ` (SAP ${d.codigoSap})` : ''}</td>
                <td><span className="plabel">MARCA:</span> {v(d.fabricante)}</td>
                <td><span className="plabel">MODELO:</span> {v(d.modelo)}</td>
              </tr>
              <tr>
                <td><span className="plabel">REFERENCIA:</span> {v(d.modeloEquipo?.referencia)}</td>
                <td><span className="plabel">N.º DE SERIE:</span> {v(d.serie)}</td>
                <td><span className="plabel">VOLTAJE:</span> {v(d.voltaje)}</td>
              </tr>
              <tr>
                <td><span className="plabel">AMPERAJE:</span> {v(d.amperaje)}</td>
                <td><span className="plabel">CAPACIDAD:</span> {v(d.capacidad)}</td>
                <td><span className="plabel">PESO:</span> {v(d.peso)}</td>
              </tr>
              <tr>
                <td><span className="plabel">FECHA DE ADQUISICIÓN:</span> {d.fechaCompra ? date(d.fechaCompra) : ''}</td>
                <td colSpan={2}><span className="plabel">GARANTÍA HASTA:</span> {d.fechaFinGarantia ? date(d.fechaFinGarantia) : ''}</td>
              </tr>
              <tr>
                <td><span className="plabel">CUENTA CON MANUAL:</span> SÍ <Marca on={tieneManual} /> NO <Marca on={!tieneManual} /></td>
                <td><span className="plabel">UBICACIÓN DEL MANUAL:</span> {[d.ubicacionManual, manuales.length ? `En el sistema (${manuales.length} PDF)` : null].filter(Boolean).join(' · ')}</td>
                <td><span className="plabel">ESTADO DEL EQUIPO:</span> {ESTADO_LABEL[d.estado]}</td>
              </tr>
            </tbody>
          </table>
          <div className="pgap" />
          <table>
            <thead>
              <tr><th colSpan={3} className="c">DESCRIPCIÓN DEL MANTENIMIENTO PREVENTIVO NECESARIO</th></tr>
              <tr><th>ACTIVIDAD</th><th style={{ width: '18%' }}>PERIODICIDAD</th><th style={{ width: '34%' }}>MATERIALES A UTILIZAR</th></tr>
            </thead>
            <tbody>
              {vigentes.length ? vigentes.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.nombre}</strong>{p.tareas ? <div className="ptxt">{p.tareas}</div> : null}</td>
                  <td>{frecuencia(p.frecuenciaValor, p.frecuenciaUnidad)}</td>
                  <td>{p.repuestos.map((r) => `${r.repuesto.descripcion} × ${qty(r.cantidad)} ${r.repuesto.unidad}`).join('; ')}</td>
                </tr>
              )) : <tr><td colSpan={3} className="ptxt">{planes.isError || !can('ADMIN', 'AUTORIZADOR', 'TECNICO') ? '' : 'Sin preventivos programados.'}</td></tr>}
            </tbody>
          </table>
          <div className="pgap" />
          <table>
            <thead><tr><th colSpan={3} className="c">REFERENCIAS DE MATERIALES</th></tr><tr><th style={{ width: '20%' }}>CÓDIGO</th><th>DESCRIPCIÓN</th><th style={{ width: '14%' }}>UNIDAD</th></tr></thead>
            <tbody>
              {materiales.size ? [...materiales.values()].map((m) => <tr key={m.codigo}><td>{m.codigo}</td><td>{m.descripcion}</td><td>{m.unidad}</td></tr>)
                : <tr><td colSpan={3} className="ptxt" /></tr>}
            </tbody>
          </table>
          <div className="pgap" />
          <table>
            <thead><tr><th className="c">REGISTRO FOTOGRÁFICO DEL EQUIPO</th></tr></thead>
            <tbody><tr><td style={{ minHeight: 60 }}>{foto ? <FotoEquipo docId={foto.id} /> : <div style={{ height: 60 }} />}</td></tr></tbody>
          </table>
          <PieSistema />
        </>
      ) : null}
    </PrintPage>
  );
}
