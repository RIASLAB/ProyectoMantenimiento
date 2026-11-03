import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import type { Asset, ChecklistItemInfo, ChecklistRecordInfo, ChecklistTemplateInfo } from '../../api/types';
import { FirmaCasilla, FormatHeader, PieSistema, PrintPage } from '../../components/print';
import { Input, Select } from '../../components/ui';
import { dateTime, ESCALA, valorChecklist } from '../../format';
import { useUrlFilters } from '../../hooks';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Lunes de la semana de una fecha (AAAA-MM-DD, hora local). */
function lunes(fecha?: string) {
  const d = fecha ? new Date(`${fecha}T12:00:00`) : new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(12, 0, 0, 0);
  return d;
}
const masDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const formatoDe = (t?: ChecklistTemplateInfo | null) => (t ? { codigo: t.codigo ?? undefined, version: t.version ?? undefined, fechaElaboracion: t.fechaElaboracion, fechaActualizacion: t.fechaActualizacion } : null);
export const lunesDe = (fecha: string) => lunes(fecha);
export const isoFecha = (d: Date) => iso(d);
const leyenda = (items: ChecklistItemInfo[]) => {
  if (items.some((i) => i.tipo === 'ESCALA')) return 'B: Bueno · R: Regular · M: Malo · No: No tiene · NA: No aplica';
  if (items.some((i) => i.tipo === 'SI_NO' && i.etiqueta === 'C_NC')) return 'C: Cumple · NC: No cumple · NA: No aplica';
  return '';
};

/** Una semana de un preoperacional (también la usa el paquete mensual). */
export function HojaSemana({ t, activo, inicio, regs }: { t: ChecklistTemplateInfo; activo: Asset | null; inicio: Date; regs: ChecklistRecordInfo[] }) {
  const fin = masDias(inicio, 6);
  // El último registro válido de cada día.
  const porDia: Array<ChecklistRecordInfo | null> = DIAS.map(() => null);
  for (const r of [...regs].filter((r) => !r.anulacion).reverse()) {
    const d = new Date(r.registradoEn);
    const k = Math.round((new Date(iso(d) + 'T12:00:00').getTime() - inicio.getTime()) / 86_400_000);
    if (k >= 0 && k < 7) porDia[k] = r;
  }
  const items = t.items;
  const notas: string[] = [];
  porDia.forEach((r, k) => {
    if (!r) return;
    const obsItems = r.respuestas.filter((x) => x.observacion).map((x) => `${x.texto}: ${x.observacion}`);
    const partes = [...obsItems, r.accionCorrectiva ? `Acción correctiva: ${r.accionCorrectiva}` : null, r.observaciones].filter(Boolean);
    if (partes.length) notas.push(`${DIAS[k]}: ${partes.join(' · ')}`);
  });
  let n = 0;
  return (
    <>
          <FormatHeader titulo={t.nombre} formato={formatoDe(t)} />
          <table>
            <tbody>
              <tr>
                <td><span className="plabel">NOMBRE DEL EQUIPO O MAQUINARIA:</span> {activo ? `${activo.codigo} · ${activo.nombre}` : ''}</td>
                <td><span className="plabel">MARCA:</span> {activo?.fabricante ?? ''}</td>
                <td><span className="plabel">MODELO:</span> {activo?.modelo ?? ''}</td>
              </tr>
              <tr>
                <td><span className="plabel">UBICACIÓN:</span> {activo ? [activo.area, activo.ubicacion].filter(Boolean).join(' · ') : t.area ?? ''}</td>
                <td><span className="plabel">PERIODICIDAD DE USO:</span> DIARIO</td>
                <td><span className="plabel">ESTADO DEL EQUIPO:</span> {activo ? (activo.estado === 'OPERATIVO' ? 'Operativo' : activo.estado.replace(/_/g, ' ').toLowerCase()) : ''}</td>
              </tr>
              <tr>
                <td><span className="plabel">SEMANA DEL:</span> {inicio.toLocaleDateString('es-CO')} <span className="plabel">HASTA</span> {fin.toLocaleDateString('es-CO')}</td>
                <td colSpan={2}><span className="plabel">JEFE DE ÁREA:</span></td>
              </tr>
            </tbody>
          </table>
          <div className="pgap" />
          <table>
            <thead>
              <tr><th className="c" style={{ width: 34 }}>ÍTEM</th><th>ACTIVIDAD</th>{DIAS.map((d) => <th key={d} className="c" style={{ width: '7.5%' }}>{d}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((i) => {
                if (i.tipo === 'SECCION') return <tr key={i.id} className="sec"><td colSpan={9}>{i.texto}</td></tr>;
                n += 1;
                return (
                  <tr key={i.id}>
                    <td className="c">{n}</td>
                    <td>{i.texto}</td>
                    {porDia.map((r, k) => {
                      const a = r?.respuestas.find((x) => x.itemId === i.id);
                      return <td key={k} className={`c ${a && !a.conforme ? 'nc-cell' : ''}`}>{a ? valorChecklist({ ...a, etiqueta: i.etiqueta }, true) : ''}{a?.observacion ? '¹' : ''}</td>;
                    })}
                  </tr>
                );
              })}
              <tr><td colSpan={2} className="r"><strong>Realizada por</strong></td>{porDia.map((r, k) => <td key={k} className="c" style={{ fontSize: '8pt' }}>{r?.usuario.nombre ?? ''}</td>)}</tr>
            </tbody>
          </table>
          <p style={{ fontSize: '8.5pt' }}>{leyenda(items)}{items.some((i) => i.tipo !== 'SECCION') ? ' · ¹ con observación' : ''}</p>
          {t.recomendacion ? <p><strong>Recomendación:</strong> {t.recomendacion}</p> : null}
          <table>
            <tbody>
              <tr><th>OBSERVACIONES</th></tr>
              <tr><td className="ptxt" style={{ minHeight: 40 }}>{notas.join('\n')}</td></tr>
            </tbody>
          </table>
          <PieSistema />
    </>
  );
}

/**
 * Preoperacional de una máquina en la semana (lunes a domingo), como el formato en papel:
 * una columna por día con la calificación de cada punto y quién lo hizo.
 */
export function PrintChecklistWeek() {
  const [f, set] = useUrlFilters(['plantilla', 'activo', 'semana'] as const);
  const inicio = lunes(f.semana || undefined);
  const fin = masDias(inicio, 6);
  const plantillas = useQuery({ queryKey: ['calidad', 'plantillas'], queryFn: () => api.get<ChecklistTemplateInfo[]>('/calidad/plantillas') });
  const activos = useQuery({ queryKey: ['activos', '', '', ''], queryFn: () => api.get<Asset[]>('/activos') });
  const t = useQuery({ queryKey: ['calidad', 'plantilla', f.plantilla], queryFn: () => api.get<ChecklistTemplateInfo>(`/calidad/plantillas/${f.plantilla}`), enabled: !!f.plantilla });
  const regs = useQuery({
    queryKey: ['calidad', 'checklists', 'semana', f.plantilla, f.activo, iso(inicio)],
    queryFn: () => api.get<ChecklistRecordInfo[]>(`/calidad/checklists${qs({ plantillaId: f.plantilla, activoId: f.activo || undefined, desde: iso(inicio), hasta: iso(fin) })}`),
    enabled: !!f.plantilla,
  });
  const activo = activos.data?.find((a) => a.id === f.activo) ?? null;

  const controles = (
    <>
      <Select value={f.plantilla} onChange={(e) => set('plantilla', e.target.value)} aria-label="Formato">
        <option value="">Elija el formato…</option>
        {plantillas.data?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </Select>
      <Select value={f.activo} onChange={(e) => set('activo', e.target.value)} aria-label="Máquina">
        <option value="">Todas las máquinas</option>
        {activos.data?.filter((a) => a.clase === 'EQUIPO').map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
      </Select>
      <button type="button" className="btn btn-ghost" aria-label="Semana anterior" onClick={() => set('semana', iso(masDias(inicio, -7)))}>‹</button>
      <Input type="date" value={iso(inicio)} onChange={(e) => set('semana', e.target.value)} aria-label="Semana del" />
      <button type="button" className="btn btn-ghost" aria-label="Semana siguiente" onClick={() => set('semana', iso(masDias(inicio, 7)))}>›</button>
    </>
  );

  return (
    <PrintPage titulo={t.data ? `${t.data.nombre} · semana ${iso(inicio)}` : 'Preoperacional semanal'} controles={controles} horizontal
      loading={!!f.plantilla && (t.isPending || regs.isPending)} error={t.error ?? regs.error}>
      {!f.plantilla ? <p>Elija el formato (y la máquina) para ver la semana.</p> : t.data ? (
        <>
          <HojaSemana t={t.data} activo={activo} inicio={inicio} regs={regs.data ?? []} />
        </>
      ) : null}
    </PrintPage>
  );
}

/** Un checklist diligenciado (hoja diaria de preoperatorio, revisión de tablero, etc.) en el formato de la planta. */
export function PrintChecklist() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['calidad', 'checklist', id],
    queryFn: () => api.get<ChecklistRecordInfo & { plantilla: ChecklistTemplateInfo | null; activo: (Asset & { id: string }) | null }>(`/calidad/checklists/${id}`),
  });
  const r = q.data;
  const itemsPlantilla = new Map((r?.plantilla?.items ?? []).map((i) => [i.id, i]));
  const preguntas = r?.respuestas.filter((x) => x.tipo !== 'SECCION') ?? [];
  // Si todo es Sí/No (C/NC, Bueno/Malo) o B/R/M, se imprime con una columna por opción, como el papel.
  const soloSiNo = preguntas.length > 0 && preguntas.every((x) => x.tipo === 'SI_NO');
  const soloEscala = preguntas.length > 0 && preguntas.every((x) => x.tipo === 'ESCALA');
  const etiqueta = (soloSiNo && itemsPlantilla.get(preguntas[0].itemId)?.etiqueta) || 'SI_NO';
  const conNA = soloSiNo && preguntas.some((x) => itemsPlantilla.get(x.itemId)?.permiteNA);
  const columnas: Array<{ v: string; t: string }> = soloEscala ? ESCALA.map((e) => ({ v: e.v, t: e.corto }))
    : soloSiNo ? [{ v: 'SI', t: etiqueta === 'C_NC' ? 'C' : etiqueta === 'BUENO_MALO' ? 'SÍ / BUENO' : 'SÍ' }, { v: 'NO', t: etiqueta === 'C_NC' ? 'NC' : etiqueta === 'BUENO_MALO' ? 'NO / MALO' : 'NO' }, ...(conNA ? [{ v: 'NA', t: 'NA' }] : [])]
    : [];
  let n = 0;
  const leyendaTxt = soloEscala ? 'B: Bueno · R: Regular · M: Malo · No: No tiene · NA: No aplica' : etiqueta === 'C_NC' ? 'C: Cumple · NC: No cumple · NA: No aplica' : '';

  return (
    <PrintPage titulo={r ? `${r.plantillaNombre} · ${new Date(r.registradoEn).toLocaleDateString('es-CO')}` : 'Checklist'} loading={q.isPending} error={q.error}>
      {r ? (
        <>
          <FormatHeader titulo={r.plantillaNombre} formato={formatoDe(r.plantilla)} />
          <table>
            <tbody>
              <tr>
                <td><span className="plabel">FECHA:</span> {dateTime(r.registradoEn)}</td>
                <td><span className="plabel">ÁREA:</span> {r.activo?.area ?? r.plantilla?.area ?? ''}</td>
              </tr>
              {r.activo ? (
                <tr>
                  <td><span className="plabel">EQUIPO:</span> {r.activo.codigo} · {r.activo.nombre}</td>
                  <td><span className="plabel">SERIAL:</span> {r.activo.serie ?? ''} {r.activo.fabricante ? `· ${r.activo.fabricante}` : ''} {r.activo.modelo ?? ''}</td>
                </tr>
              ) : null}
              {r.anulacion ? <tr><td colSpan={2}><strong>REGISTRO ANULADO:</strong> {r.anulacion.motivo}</td></tr> : null}
            </tbody>
          </table>
          <div className="pgap" />
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 34 }}>N.º</th>
                <th>{soloSiNo && etiqueta === 'C_NC' ? 'EQUIPOS' : 'ACTIVIDAD'}</th>
                {columnas.length ? columnas.map((c) => <th key={c.v} className="c" style={{ width: soloEscala ? '6%' : '9%' }}>{c.t}</th>) : <th style={{ width: '22%' }}>RESULTADO</th>}
                <th style={{ width: '28%' }}>OBSERVACIONES</th>
              </tr>
            </thead>
            <tbody>
              {r.respuestas.map((a) => {
                if (a.tipo === 'SECCION') return <tr key={a.itemId} className="sec"><td colSpan={3 + Math.max(columnas.length, 1)}>{a.texto}</td></tr>;
                n += 1;
                return (
                  <tr key={a.itemId}>
                    <td className="c">{n}</td>
                    <td>{a.texto}</td>
                    {columnas.length ? columnas.map((c) => <td key={c.v} className={`c ${a.valor === c.v && !a.conforme ? 'nc-cell' : ''}`}>{a.valor === c.v ? 'X' : ''}</td>)
                      : <td className={a.conforme ? '' : 'nc-cell'}>{valorChecklist({ ...a, etiqueta: itemsPlantilla.get(a.itemId)?.etiqueta })}</td>}
                    <td>{a.observacion ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {leyendaTxt ? <p style={{ fontSize: '8.5pt' }}>{leyendaTxt}</p> : null}
          {r.plantilla?.recomendacion ? <p><strong>Recomendación:</strong> {r.plantilla.recomendacion}</p> : null}
          <table>
            <tbody>
              <tr><th>OBSERVACIONES</th></tr>
              <tr><td className="ptxt" style={{ minHeight: 36 }}>{[r.accionCorrectiva ? `Acción correctiva: ${r.accionCorrectiva}` : null, r.observaciones].filter(Boolean).join('\n')}</td></tr>
            </tbody>
          </table>
          <div className="pfirmas dos">
            <FirmaCasilla entidad="CHECKLIST" entidadId={r.id} casilla="REALIZO" cargo="Realizó" nombre={r.usuario.nombre} />
            <FirmaCasilla entidad="CHECKLIST" entidadId={r.id} casilla="VERIFICO" cargo="Verificó (jefe de área)" />
          </div>
          <PieSistema />
        </>
      ) : null}
    </PrintPage>
  );
}

