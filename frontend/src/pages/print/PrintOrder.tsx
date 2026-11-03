import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { WorkOrderDetail } from '../../api/types';
import { useProtectedImage } from '../../components/orders-shared';
import { Firma, FormatHeader, Marca, PieSistema, PrintPage, useFormatos } from '../../components/print';
import { dateTime, money, ORDEN_ESTADO_LABEL, PRIORIDAD_LABEL, qty, VERIFICACIONES_CIERRE } from '../../format';

function Foto({ id, momento }: { id: string; momento: string }) {
  const url = useProtectedImage(`/ordenes/fotos/${id}/archivo`);
  return (
    <figure style={{ margin: 0 }}>
      {url ? <img className="pfoto" src={url} alt={`Foto ${momento}`} style={{ maxHeight: '45mm' }} /> : null}
      <figcaption className="c" style={{ fontSize: '8pt' }}>{momento === 'ANTES' ? 'Antes' : momento === 'DESPUES' ? 'Después' : 'Reporte'}</figcaption>
    </figure>
  );
}

/** Orden de trabajo en el formato AC-PMT FR03 de la planta. */
export function PrintOrder() {
  const { id } = useParams<{ id: string }>();
  const o = useQuery({ queryKey: ['orden', id], queryFn: () => api.get<WorkOrderDetail>(`/ordenes/${id}`) });
  const f = useFormatos();
  const d = o.data;
  const instalacion = d?.activo.clase === 'INSTALACION';
  const verif = new Map((d?.verificaciones ?? []).map((v) => [v.id, v.cumple]));
  const usados = d?.repuestos.filter((r) => (r.cantidadUsada ?? 0) > 0) ?? [];
  const planificados = d?.repuestos.filter((r) => r.cantidadPlanificada > 0) ?? [];
  const materiales = d?.estado === 'CERRADA' ? usados : planificados;

  return (
    <PrintPage titulo={d ? `${d.codigo} · Orden de trabajo` : 'Orden de trabajo'} loading={o.isPending || f.isPending} error={o.error}>
      {d ? (
        <>
          <FormatHeader titulo="Orden de trabajo mantenimiento de equipos e instalaciones" formato={f.data?.OT} />
          <table>
            <tbody>
              <tr>
                <td><span className="plabel">N.º DE ORDEN:</span> {d.codigo}</td>
                <td><span className="plabel">ESTADO:</span> {ORDEN_ESTADO_LABEL[d.estado]}</td>
                <td><span className="plabel">PRIORIDAD:</span> {PRIORIDAD_LABEL[d.prioridad]}</td>
              </tr>
              <tr>
                <td colSpan={2}><span className="plabel">FECHA INICIO:</span> {d.iniciadaEn ? dateTime(d.iniciadaEn) : d.fechaProgramada ? `Programada ${d.fechaProgramada.split('-').reverse().join('/')}` : dateTime(d.creadoEn)}</td>
                <td><span className="plabel">FECHA DE CIERRE:</span> {d.cerradaEn ? dateTime(d.cerradaEn) : ''}</td>
              </tr>
              <tr>
                <td><span className="plabel">EQUIPO:</span> {instalacion ? '' : `${d.activo.codigo} · ${d.activo.nombre}`}</td>
                <td><span className="plabel">INSTALACIÓN:</span> {instalacion ? `${d.activo.codigo} · ${d.activo.nombre}` : ''}</td>
                <td><span className="plabel">TIPO DE MANTENIMIENTO:</span><br />PREVENTIVO <Marca on={d.tipo === 'PREVENTIVO'} /> CORRECTIVO <Marca on={d.tipo === 'CORRECTIVO'} /></td>
              </tr>
              <tr>
                <td colSpan={2}><span className="plabel">UBICACIÓN:</span> {[d.activo.area, d.activo.ubicacion].filter(Boolean).join(' · ')}</td>
                <td><span className="plabel">CLASE DE MANTENIMIENTO:</span><br />LOCATIVO <Marca on={instalacion} /> EQUIPO <Marca on={!instalacion} /></td>
              </tr>
              {d.maquinaParada ? (
                <tr><td colSpan={3}><span className="plabel">PARADA:</span> {d.inicioParada ? dateTime(d.inicioParada) : '—'} a {d.finParada ? dateTime(d.finParada) : 'sin terminar'}</td></tr>
              ) : null}
            </tbody>
          </table>
          <div className="pgap" />
          <table>
            <tbody>
              <tr><th>DESCRIBA LA NOVEDAD</th></tr>
              <tr><td className="ptxt">{d.descripcion}</td></tr>
              <tr><th>TRABAJO REALIZADO</th></tr>
              <tr><td className="ptxt" style={{ minHeight: 40 }}>{d.trabajoRealizado ?? ''}</td></tr>
            </tbody>
          </table>
          {materiales.length || d.manoObra.length ? (
            <>
              <div className="pgap" />
              <table>
                <thead><tr><th>{d.estado === 'CERRADA' ? 'REPUESTOS Y MATERIALES USADOS' : 'MATERIALES PLANIFICADOS'}</th><th className="c" style={{ width: '18%' }}>CANTIDAD</th></tr></thead>
                <tbody>
                  {materiales.map((r) => (
                    <tr key={r.id}><td>{r.repuesto.codigo} · {r.repuesto.descripcion}</td><td className="c">{qty(d.estado === 'CERRADA' ? r.cantidadUsada ?? 0 : r.cantidadPlanificada)} {r.repuesto.unidad}</td></tr>
                  ))}
                  {d.manoObra.map((l) => <tr key={l.id}><td>Mano de obra · {l.tecnico.nombre}</td><td className="c">{qty(l.horas)} h</td></tr>)}
                  {d.estado === 'CERRADA' && d.costoServiciosExternos ? <tr><td>Servicios externos</td><td className="c">{money(d.costoServiciosExternos)}</td></tr> : null}
                </tbody>
              </table>
            </>
          ) : null}
          <div className="pgap" />
          <table>
            <thead><tr><th>VERIFICACIONES DE ENTREGA</th><th className="c" style={{ width: '11%' }}>CUMPLE</th><th className="c" style={{ width: '11%' }}>NO CUMPLE</th></tr></thead>
            <tbody>
              {VERIFICACIONES_CIERRE.map((v) => (
                <tr key={v.id}>
                  <td>{v.texto}.</td>
                  <td className="c">{verif.get(v.id) === true ? 'X' : ''}</td>
                  <td className="c">{verif.get(v.id) === false ? 'X' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pgap" />
          <table>
            <tbody>
              <tr><th>OBSERVACIONES</th></tr>
              <tr><td className="ptxt" style={{ minHeight: 36 }}>{[d.observaciones, d.motivoCancelacion ? `Cancelada: ${d.motivoCancelacion}` : null].filter(Boolean).join('\n')}</td></tr>
            </tbody>
          </table>
          {d.fotos.some((x) => x.momento !== 'REPORTE') ? (
            <>
              <h3>Registro fotográfico</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {d.fotos.filter((x) => x.momento !== 'REPORTE').slice(0, 6).map((x) => <Foto key={x.id} id={x.id} momento={x.momento} />)}
              </div>
            </>
          ) : null}
          <div className="pfirmas">
            <Firma cargo="Responsable del reporte" nombre={d.reportadoPor?.nombre ?? (d.plan ? `Preventivo: ${d.plan.nombre}` : null)} />
            <Firma cargo="Jefe de mantenimiento" />
            <Firma cargo="Líder de área" />
          </div>
          <p className="ppie">Técnico: {d.asignadoA?.nombre ?? '—'}{d.cerradaPor ? ` · Cerró: ${d.cerradaPor.nombre}` : ''}</p>
          <PieSistema />
        </>
      ) : null}
    </PrintPage>
  );
}
