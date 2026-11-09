import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EstadoOrden, TipoOrden, UnidadFrecuencia } from '../common/enums';
import { periodicidadTexto } from '../import/hoja-vida.service';
import { KpiService } from '../kpi/kpi.service';
import { hoy, numeroOT, sumarFrecuencia } from '../maintenance/maintenance.service';
import { lunesDeSemana, mesDeSemana, semanaIso, semanasDelAnio } from './semanas';

/** Meta de cumplimiento del planeador de la planta si no se ha fijado otra en los indicadores. */
export const META_PLANEADOR = 99;

interface MarcaOrden { ordenId: string; codigo: string; estado: EstadoOrden }
interface SemanaMaquina { p: MarcaOrden[]; proyectada: boolean; e: MarcaOrden[] }

/** "Evaporador pasillo #2", "Termoformadora 3" → "Evaporador pasillo", "Termoformadora". */
const equipoBase = (nombre: string) => nombre.replace(/\s*(?:[#Nº°.-]+\s*)?\d+\s*$/i, '').replace(/\s*\(\d+\)\s*$/, '').trim() || nombre;

/**
 * Planeador anual de mantenimiento preventivo por planta (formato AC-PMT-CR01, D-36). No se llena: las semanas
 * programadas salen de las órdenes preventivas (y de la proyección de cada plan hasta fin de año) y las ejecutadas
 * de las órdenes cerradas, en la semana en que se hicieron. Una fila agrupa las máquinas del mismo equipo con el
 * mismo plan, como en el Excel; al abrirla se ve cada máquina.
 */
@Injectable()
export class PlannerService {
  constructor(private readonly ds: DataSource, private readonly kpi: KpiService) {}

  async areas() {
    const filas: Array<{ area: string }> = await this.ds.query(
      `SELECT DISTINCT a.area FROM activos a JOIN planes_mantenimiento p ON p.activo_id = a.id ORDER BY a.area`,
    );
    return filas.map((f) => f.area);
  }

  async planeador(area: string, anioParam?: string, corteParam?: string) {
    if (!area?.trim()) throw new BadRequestException('Elija la planta o área');
    const hoyStr = hoy();
    const actual = semanaIso(hoyStr);
    const anio = anioParam ? Number(anioParam) : actual.anio;
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new BadRequestException('Año inválido');
    const total = semanasDelAnio(anio);
    let corte = corteParam ? Number(corteParam) : anio === actual.anio ? actual.semana : anio < actual.anio ? total : 0;
    if (!Number.isInteger(corte) || corte < 0 || corte > total) throw new BadRequestException(`La semana de corte va de 0 a ${total}`);
    corte = Math.min(corte, total);
    const desde = lunesDeSemana(anio, 1);
    const hasta = new Date(Date.parse(`${lunesDeSemana(anio, total)}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);

    const planes: Array<{
      id: string; nombre: string; frecuencia_valor: number; frecuencia_unidad: UnidadFrecuencia; vigente: boolean; tareas: string | null;
      activo_id: string; codigo: string; activo: string; tipo: string | null; tareas_plan: string[] | null;
    }> = await this.ds.query(
      `SELECT p.id, p.nombre, p.frecuencia_valor, p.frecuencia_unidad, p.vigente, p.tareas,
              a.id AS activo_id, a.codigo, a.nombre AS activo, m.nombre AS tipo,
              (SELECT array_agg(t.nombre ORDER BY pt.orden) FROM plan_tareas pt JOIN tareas_mantenimiento t ON t.id = pt.tarea_id WHERE pt.plan_id = p.id) AS tareas_plan
         FROM planes_mantenimiento p
         JOIN activos a ON a.id = p.activo_id
         LEFT JOIN modelos_equipo m ON m.id = a.modelo_id
        WHERE lower(a.area) = lower($1)`,
      [area.trim()],
    );
    if (!planes.length) return { area, anio, semanas: this.semanas(anio, total), corte, meta: await this.meta(), resumen: this.resumen([], corte), filas: [] };

    const ordenes: Array<{ id: string; numero: number; plan_id: string; estado: EstadoOrden; programada: string | null; realizada: string | null; motivo: string | null }> = await this.ds.query(
      `SELECT o.id, o.numero, o.plan_id, o.estado, to_char(o.fecha_programada, 'YYYY-MM-DD') AS programada,
              to_char(COALESCE(o.fecha_realizacion, (o.cerrada_en AT TIME ZONE $4)::date), 'YYYY-MM-DD') AS realizada, o.motivo_cancelacion AS motivo
         FROM ordenes_trabajo o
        WHERE o.tipo = $1 AND o.plan_id = ANY($2)
          AND (o.fecha_programada BETWEEN $3::date AND $5::date
               OR (o.estado = 'CERRADA' AND COALESCE(o.fecha_realizacion, (o.cerrada_en AT TIME ZONE $4)::date) BETWEEN $3::date AND $5::date)
               OR o.estado IN ('ABIERTA', 'ASIGNADA'))
        ORDER BY o.numero`,
      [TipoOrden.PREVENTIVO, planes.map((p) => p.id), desde, process.env.APP_TZ ?? 'America/Bogota', hasta],
    );
    const reprogramaciones: Array<{ orden_id: string; numero: number; anterior: string; nueva: string; motivo: string }> = await this.ds.query(
      `SELECT r.orden_id, o.numero, to_char(r.fecha_anterior, 'YYYY-MM-DD') AS anterior, to_char(r.fecha_nueva, 'YYYY-MM-DD') AS nueva, r.motivo
         FROM ot_reprogramaciones r JOIN ordenes_trabajo o ON o.id = r.orden_id
        WHERE o.plan_id = ANY($1) AND (r.fecha_anterior BETWEEN $2::date AND $3::date OR r.fecha_nueva BETWEEN $2::date AND $3::date)
        ORDER BY r.id`,
      [planes.map((p) => p.id), desde, hasta],
    );

    const semanaEn = (f: string | null) => {
      if (!f) return null;
      const s = semanaIso(f);
      return s.anio === anio ? s.semana : null;
    };
    const vacia = (): Record<number, SemanaMaquina> => ({});
    const marca = (m: Record<number, SemanaMaquina>, w: number) => (m[w] ??= { p: [], proyectada: false, e: [] });

    interface Fila {
      clave: string; equipo: string; frecuencia: { valor: number; unidad: UnidadFrecuencia }; frecuenciaTexto: string; plan: string;
      actividad: string; maquinas: Map<string, { id: string; codigo: string; nombre: string; planId: string; vigente: boolean; semanas: Record<number, SemanaMaquina> }>;
      observaciones: string[];
    }
    const filas = new Map<string, Fila>();
    const porPlan = new Map(planes.map((p) => [p.id, p]));
    for (const p of planes) {
      const equipo = p.tipo ?? equipoBase(p.activo);
      const clave = `${equipo.toLowerCase()}|${p.frecuencia_valor}-${p.frecuencia_unidad}|${p.nombre.toLowerCase()}`;
      const f = filas.get(clave) ?? {
        clave, equipo, frecuencia: { valor: p.frecuencia_valor, unidad: p.frecuencia_unidad }, frecuenciaTexto: periodicidadTexto({ valor: p.frecuencia_valor, unidad: p.frecuencia_unidad }),
        plan: p.nombre, actividad: [...(p.tareas_plan ?? []), ...(p.tareas ? [p.tareas] : [])].join('. ') || p.nombre, maquinas: new Map(), observaciones: [],
      };
      if (!f.maquinas.has(p.activo_id + p.id)) f.maquinas.set(p.activo_id + p.id, { id: p.activo_id, codigo: p.codigo, nombre: p.activo, planId: p.id, vigente: p.vigente, semanas: vacia() });
      filas.set(clave, f);
    }
    const maquinaDe = (planId: string) => {
      const p = porPlan.get(planId)!;
      const equipo = p.tipo ?? equipoBase(p.activo);
      const f = filas.get(`${equipo.toLowerCase()}|${p.frecuencia_valor}-${p.frecuencia_unidad}|${p.nombre.toLowerCase()}`)!;
      return { fila: f, maq: f.maquinas.get(p.activo_id + p.id)! };
    };

    // Programadas (fecha actual de la orden) y ejecutadas (semana en que se hizo).
    const pendientes = new Map<string, string>();
    for (const o of ordenes) {
      const { fila, maq } = maquinaDe(o.plan_id);
      const m: MarcaOrden = { ordenId: o.id, codigo: numeroOT(o.numero), estado: o.estado };
      const wp = semanaEn(o.programada);
      if (wp) marca(maq.semanas, wp).p.push(m);
      if (o.estado === EstadoOrden.CERRADA) {
        const we = semanaEn(o.realizada);
        if (we) marca(maq.semanas, we).e.push(m);
      }
      if (o.estado === EstadoOrden.CANCELADA && wp) fila.observaciones.push(`${maq.codigo} · ${m.codigo} cancelada (S${wp}): ${o.motivo ?? 'sin motivo'}`);
      if ([EstadoOrden.ABIERTA, EstadoOrden.ASIGNADA, EstadoOrden.EN_EJECUCION, EstadoOrden.ESPERANDO_REPUESTO].includes(o.estado) && o.programada) {
        const prev = pendientes.get(o.plan_id);
        if (!prev || o.programada > prev) pendientes.set(o.plan_id, o.programada);
      }
    }
    // Proyección de cada plan vigente hasta fin de año desde su orden pendiente.
    for (const p of planes) {
      const base = pendientes.get(p.id);
      if (!p.vigente || !base) continue;
      const { maq } = maquinaDe(p.id);
      let f = sumarFrecuencia(base, p.frecuencia_valor, p.frecuencia_unidad);
      for (let i = 0; f <= hasta && i < 400; i++) {
        const w = semanaEn(f);
        if (w && f >= hoyStr) { const s = marca(maq.semanas, w); s.proyectada = true; }
        f = sumarFrecuencia(f, p.frecuencia_valor, p.frecuencia_unidad);
      }
    }
    for (const r of reprogramaciones) {
      const o = ordenes.find((x) => x.id === r.orden_id);
      if (!o) continue;
      const { fila, maq } = maquinaDe(o.plan_id);
      const a = semanaIso(r.anterior); const n = semanaIso(r.nueva);
      fila.observaciones.push(`${maq.codigo} · ${numeroOT(r.numero)} reprogramada de S${a.semana}${a.anio !== anio ? `/${a.anio}` : ''} a S${n.semana}${n.anio !== anio ? `/${n.anio}` : ''}: ${r.motivo}`);
    }

    const salida = [...filas.values()].map((f) => {
      const maquinas = [...f.maquinas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
      const semanas: Record<number, { p: number; proyectadas: number; e: number }> = {};
      for (const m of maquinas) for (const [w, s] of Object.entries(m.semanas)) {
        const t = (semanas[Number(w)] ??= { p: 0, proyectadas: 0, e: 0 });
        t.p += s.p.length; t.e += s.e.length; if (s.proyectada && !s.p.length) t.proyectadas += 1;
      }
      const cuenta = (hastaSem: number, k: 'p' | 'e' | 'proyectadas') => Object.entries(semanas).filter(([w]) => Number(w) <= hastaSem).reduce((n, [, s]) => n + s[k], 0);
      const programadasCorte = cuenta(corte, 'p');
      const ejecutadasCorte = cuenta(corte, 'e');
      return {
        clave: f.clave, equipo: f.equipo, cantidad: new Set(maquinas.map((m) => m.id)).size, frecuencia: f.frecuencia, frecuenciaTexto: f.frecuenciaTexto, plan: f.plan,
        actividad: f.actividad, semanas,
        programadasAnio: cuenta(total, 'p') + cuenta(total, 'proyectadas'), programadasCorte, ejecutadasCorte, ejecutadasAnio: cuenta(total, 'e'),
        cumplimiento: programadasCorte ? Math.round((ejecutadasCorte / programadasCorte) * 1000) / 10 : null,
        estado: !programadasCorte ? 'SIN_ACTIVIDADES' : ejecutadasCorte >= programadasCorte ? 'CUMPLIDAS' : 'PENDIENTES',
        observaciones: f.observaciones,
        maquinas: maquinas.map((m) => ({ id: m.id, codigo: m.codigo, nombre: m.nombre, planId: m.planId, vigente: m.vigente, semanas: m.semanas })),
      };
    }).sort((a, b) => a.equipo.localeCompare(b.equipo, 'es') || a.plan.localeCompare(b.plan, 'es'));

    return { area: planes[0] ? area.trim() : area, anio, semanas: this.semanas(anio, total), corte, meta: await this.meta(), resumen: this.resumen(salida, corte), filas: salida };
  }

  private semanas(anio: number, total: number) {
    return Array.from({ length: total }, (_, i) => ({ n: i + 1, mes: mesDeSemana(anio, i + 1), lunes: lunesDeSemana(anio, i + 1) }));
  }

  private async meta() {
    return (await this.kpi.parametros()).metas.cumplimiento ?? META_PLANEADOR;
  }

  private resumen(filas: Array<{ programadasCorte: number; ejecutadasCorte: number; programadasAnio: number; ejecutadasAnio: number }>, corte: number) {
    const programadas = filas.reduce((n, f) => n + f.programadasCorte, 0);
    const ejecutadas = filas.reduce((n, f) => n + f.ejecutadasCorte, 0);
    return {
      corte, programadasCorte: programadas, ejecutadasCorte: ejecutadas,
      programadasAnio: filas.reduce((n, f) => n + f.programadasAnio, 0), ejecutadasAnio: filas.reduce((n, f) => n + f.ejecutadasAnio, 0),
      cumplimiento: programadas ? Math.round((ejecutadas / programadas) * 1000) / 10 : null,
    };
  }
}
