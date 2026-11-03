import { useQueries, useQuery } from '@tanstack/react-query';
import { api, qs } from '../../api/client';
import type { Asset, ChecklistRecordInfo, ChecklistTemplateInfo, InstrumentInfo, LightingSurvey, PlanillaTemperaturas, WorkOrderSummary } from '../../api/types';
import { FormatHeader, PieSistema, PrintPage } from '../../components/print';
import { Input, Select } from '../../components/ui';
import { date, dateTime, TIPO_LABEL } from '../../format';
import { useUrlFilters } from '../../hooks';
import { ESTADO_CAL } from '../quality/Instruments';
import { HojaSemana, isoFecha, lunesDe } from './PrintChecklist';
import { HojaTemperaturas } from './PrintTemperatures';

const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
type OrdenCerrada = WorkOrderSummary & { trabajoRealizado?: string | null; verificaciones?: Array<{ cumple: boolean }> | null; observaciones?: string | null };

/** Días del mes hasta hoy (AAAA-MM-DD). */
function diasDelMes(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hoy = hoyLocal();
  return Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`).filter((d) => d <= hoy);
}

/**
 * Paquete mensual para auditoría (BPM / INVIMA) de una planta: en un solo documento las planillas diarias de temperatura,
 * los preoperacionales por semana, las órdenes cerradas y el estado de calibración de los instrumentos.
 */
export function PrintMonthly() {
  const [f, set] = useUrlFilters(['mes', 'area'] as const);
  const mes = f.mes || hoyLocal().slice(0, 7);
  const areas = useQuery({ queryKey: ['calidad', 'planilla', 'areas'], queryFn: () => api.get<string[]>('/calidad/planilla/areas') });
  const area = f.area || areas.data?.[0] || '';
  const dias = diasDelMes(mes);
  const desde = `${mes}-01`;
  const hasta = dias.at(-1) ?? desde;

  const planillas = useQueries({
    queries: dias.map((d) => ({
      queryKey: ['calidad', 'planilla', area, d],
      queryFn: () => api.get<PlanillaTemperaturas>(`/calidad/planilla${qs({ area, fecha: d })}`),
      enabled: !!area,
      staleTime: 60_000,
    })),
  });
  const plantillas = useQuery({ queryKey: ['calidad', 'plantillas', 'todas'], queryFn: () => api.get<ChecklistTemplateInfo[]>('/calidad/plantillas?incluirInactivas=true') });
  const activos = useQuery({ queryKey: ['activos', '', '', '', 'todas'], queryFn: () => api.get<Asset[]>('/activos') });
  const checks = useQuery({
    queryKey: ['calidad', 'checklists', 'mes', desde, hasta],
    queryFn: () => api.get<ChecklistRecordInfo[]>(`/calidad/checklists${qs({ desde, hasta })}`),
    enabled: dias.length > 0,
  });
  const ordenes = useQuery({
    queryKey: ['ordenes', 'cerradas-mes', area, desde, hasta],
    queryFn: () => api.get<OrdenCerrada[]>(`/ordenes${qs({ vista: 'cerradas', estado: 'CERRADA', area, cerradaDesde: desde, cerradaHasta: hasta })}`),
    enabled: !!area && dias.length > 0,
  });
  const instrumentos = useQuery({ queryKey: ['instrumentos'], queryFn: () => api.get<InstrumentInfo[]>('/instrumentos') });
  const iluminacion = useQuery({ queryKey: ['iluminacion', 'mediciones'], queryFn: () => api.get<LightingSurvey[]>('/iluminacion/mediciones') });

  const cargando = areas.isPending || planillas.some((q) => q.isPending) || plantillas.isPending || activos.isPending || checks.isPending
    || ordenes.isPending || instrumentos.isPending || iluminacion.isPending;
  const error = areas.error ?? plantillas.error ?? activos.error ?? checks.error ?? ordenes.error ?? instrumentos.error ?? iluminacion.error ?? planillas.find((q) => q.error)?.error;

  const mismaArea = (a?: string | null) => !!a && a.toLowerCase() === area.toLowerCase();
  const conLecturas = planillas.map((q) => q.data).filter((p): p is PlanillaTemperaturas => !!p && p.lecturas.length > 0);
  const tplPorId = new Map((plantillas.data ?? []).map((t) => [t.id, t]));
  const actPorId = new Map((activos.data ?? []).map((a) => [a.id, a]));
  // Preoperacionales y hojas diarias de la planta, agrupados por formato, máquina y semana.
  const grupos = new Map<string, { t: ChecklistTemplateInfo; activo: Asset | null; inicio: Date; regs: ChecklistRecordInfo[] }>();
  for (const r of checks.data ?? []) {
    if (r.anulacion) continue;
    const t = tplPorId.get(r.plantillaId);
    const activo = r.activo ? actPorId.get(r.activo.id) ?? null : null;
    if (!t || !(mismaArea(t.area) || mismaArea(activo?.area))) continue;
    const inicio = lunesDe(isoFecha(new Date(r.registradoEn)));
    const k = `${t.nombre}|${activo?.codigo ?? ''}|${isoFecha(inicio)}`;
    const g = grupos.get(k) ?? { t, activo, inicio, regs: [] };
    g.regs.push(r);
    grupos.set(k, g);
  }
  const semanas = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, g]) => g);
  const instArea = (instrumentos.data ?? []).filter((i) => i.vigente && mismaArea(i.area));
  const otrosInst = (instrumentos.data ?? []).filter((i) => i.vigente && !mismaArea(i.area));
  const ilumMes = (iluminacion.data ?? []).filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const verificadas = conLecturas.filter((p) => p.verificacion).length;
  const fuera = conLecturas.reduce((s, p) => s + p.lecturas.filter((l) => l.fueraDeRango).length, 0);
  const [y, m] = mes.split('-').map(Number);
  const titulo = `${MESES[m - 1]} de ${y}`;

  const controles = (
    <>
      <Select value={area} onChange={(e) => set('area', e.target.value)} aria-label="Planta o área">
        {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
      </Select>
      <Input type="month" value={mes} max={hoyLocal().slice(0, 7)} onChange={(e) => set('mes', e.target.value)} aria-label="Mes" />
    </>
  );

  return (
    <PrintPage titulo={`Paquete ${area} ${mes}`} controles={controles} horizontal loading={cargando} error={error}>
      <FormatHeader titulo={`Registros de mantenimiento y calidad · ${area} · ${titulo}`} formato={{ codigo: 'Paquete mensual', version: '—' }} />
      <h3>Contenido</h3>
      <table style={{ width: '70%' }}>
        <tbody>
          <tr><td>1. Planillas diarias de temperatura</td><td className="c">{conLecturas.length} día{conLecturas.length === 1 ? '' : 's'} · {verificadas} verificada{verificadas === 1 ? '' : 's'} · {fuera} lectura{fuera === 1 ? '' : 's'} fuera de rango</td></tr>
          <tr><td>2. Preoperacionales y hojas diarias (por semana)</td><td className="c">{semanas.length} hoja{semanas.length === 1 ? '' : 's'} · {semanas.reduce((s, g) => s + g.regs.length, 0)} registros</td></tr>
          <tr><td>3. Órdenes de trabajo cerradas</td><td className="c">{ordenes.data?.length ?? 0}</td></tr>
          <tr><td>4. Calibración de instrumentos</td><td className="c">{instArea.length + otrosInst.length} instrumento{instArea.length + otrosInst.length === 1 ? '' : 's'}</td></tr>
          <tr><td>5. Mediciones de iluminación del mes</td><td className="c">{ilumMes.length}</td></tr>
        </tbody>
      </table>
      {conLecturas.length && verificadas < conLecturas.length ? (
        <p><strong>Atención:</strong> {conLecturas.length - verificadas} planilla{conLecturas.length - verificadas === 1 ? '' : 's'} sin verificar.</p>
      ) : null}
      <PieSistema />

      {conLecturas.map((p) => (
        <section key={p.fecha} className="page-break">
          <HojaTemperaturas p={p} fecha={p.fecha} claveFirma={`${p.fecha}|${areas.data?.find((x) => x.toLowerCase() === p.area.toLowerCase()) ?? p.area}`} />
        </section>
      ))}

      {semanas.map((g) => (
        <section key={`${g.t.id}|${g.activo?.id ?? ''}|${isoFecha(g.inicio)}`} className="page-break">
          <HojaSemana t={g.t} activo={g.activo} inicio={g.inicio} regs={g.regs} />
        </section>
      ))}

      <section className="page-break">
        <h3>Órdenes de trabajo cerradas · {area} · {titulo}</h3>
        {ordenes.data?.length ? (
          <table>
            <thead><tr><th>OT</th><th>Cierre</th><th>Equipo / instalación</th><th>Tipo</th><th>Trabajo realizado</th><th className="c">Verificaciones</th><th>Técnico</th></tr></thead>
            <tbody>
              {ordenes.data.map((o) => {
                const nc = o.verificaciones?.filter((v) => !v.cumple).length ?? null;
                return (
                  <tr key={o.id}>
                    <td>{o.codigo}</td>
                    <td>{o.cerradaEn ? dateTime(o.cerradaEn) : ''}</td>
                    <td>{o.activo ? `${o.activo.codigo} · ${o.activo.nombre}` : ''}</td>
                    <td>{TIPO_LABEL[o.tipo]}</td>
                    <td style={{ fontSize: '8.5pt' }}>{o.trabajoRealizado ?? ''}{o.observaciones ? ` · Obs.: ${o.observaciones}` : ''}</td>
                    <td className={`c ${nc ? 'nc-cell' : ''}`}>{nc === null ? '—' : nc ? `${nc} no cumple` : 'Cumple'}</td>
                    <td>{o.asignadoA?.nombre ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p>No hay órdenes cerradas en el mes.</p>}

        <h3>Calibración de instrumentos de medición</h3>
        {instArea.length + otrosInst.length ? (
          <table>
            <thead><tr><th>Código</th><th>Instrumento</th><th>Área</th><th>Última calibración</th><th>Laboratorio</th><th>Vence</th><th>Estado</th></tr></thead>
            <tbody>
              {[...instArea, ...otrosInst].map((i) => (
                <tr key={i.id}>
                  <td>{i.codigo}</td><td>{i.nombre}</td><td>{i.area}</td>
                  <td>{i.ultima ? date(i.ultima.fecha) : '—'}</td><td>{i.ultima?.laboratorio ?? ''}</td><td>{i.ultima ? date(i.ultima.venceEn) : '—'}</td>
                  <td className={ESTADO_CAL[i.estado].tone === 'bad' ? 'nc-cell' : ''}>{ESTADO_CAL[i.estado].label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>No hay instrumentos registrados.</p>}

        <h3>Mediciones de iluminación del mes</h3>
        {ilumMes.length ? (
          <table style={{ width: '70%' }}>
            <thead><tr><th>Fecha</th><th>Lugar</th><th>Evaluador</th><th className="c">Cumplen</th><th className="c">No cumplen</th></tr></thead>
            <tbody>{ilumMes.map((x) => <tr key={x.id}><td>{date(x.fecha)}</td><td>{x.lugar}</td><td>{x.evaluador}</td><td className="c">{x.puntosCumplen}</td><td className="c">{x.puntosNoCumplen}</td></tr>)}</tbody>
          </table>
        ) : <p>No hubo mediciones de iluminación en el mes.</p>}
        <PieSistema />
      </section>
    </PrintPage>
  );
}
