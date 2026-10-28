import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { Setting } from '../settings/setting.entity';

export const PARAM_INDICADORES = 'indicadores';
const TZ = () => process.env.APP_TZ ?? 'America/Bogota';
const HORA = 3_600_000;

/**
 * Parámetros de los indicadores (D-05 asumido mientras Dirección aprueba fórmulas y metas, KPI-07).
 * El tiempo planificado de producción sale de un calendario simple: días de la semana y horario de la planta.
 */
export interface ParametrosKpi {
  /** Días de producción, 1 = lunes … 7 = domingo. */
  dias: number[];
  /** Horario de producción "HH:MM" (fin "24:00" = hasta medianoche). */
  horaInicio: string;
  horaFin: string;
  metas: {
    /** % de disponibilidad */
    disponibilidad: number | null;
    /** horas */
    mtbf: number | null;
    /** horas */
    mttr: number | null;
    /** % de cumplimiento de preventivos */
    cumplimiento: number | null;
    /** veces en el período */
    rotacion: number | null;
  };
}

export const PARAMETROS_POR_DEFECTO: ParametrosKpi = {
  dias: [1, 2, 3, 4, 5, 6, 7],
  horaInicio: '00:00',
  horaFin: '24:00',
  metas: { disponibilidad: null, mtbf: null, mttr: null, cumplimiento: null, rotacion: null },
};

type Intervalo = [number, number];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);

/** Diferencia (minutos) entre la hora local de la zona y UTC en ese instante. */
function desfase(tz: string, t: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]),
  );
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000) / 60_000;
}

/** Instante UTC de una fecha y hora locales de la planta. */
export function local(fecha: string, hhmm: string, tz = TZ()) {
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const supuesto = Date.UTC(y, m - 1, d, h, min);
  return supuesto - desfase(tz, supuesto - desfase(tz, supuesto) * 60_000) * 60_000;
}

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaSemana = (fecha: string) => ((new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const hoyLocal = (tz = TZ()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

/** Ventanas de producción del período según el calendario, sin pasar de `hasta` (normalmente "ahora"). */
export function ventanasProduccion(desde: string, hasta: string, p: Pick<ParametrosKpi, 'dias' | 'horaInicio' | 'horaFin'>, limite: number): Intervalo[] {
  const v: Intervalo[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    if (!p.dias.includes(diaSemana(f))) continue;
    const a = local(f, p.horaInicio);
    const b = Math.min(local(f, p.horaFin), limite);
    if (b > a) v.push([a, b]);
  }
  return v;
}

/** Une intervalos que se cruzan (dos OT con la misma máquina parada al tiempo no cuentan doble). */
export function unir(xs: Intervalo[]): Intervalo[] {
  const s = xs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Intervalo[] = [];
  for (const [a, b] of s) {
    const u = out[out.length - 1];
    if (u && a <= u[1]) u[1] = Math.max(u[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Tiempo (ms) de `xs` que cae dentro de `ventanas`. Ambas listas ordenadas y sin cruces. */
export function cruce(xs: Intervalo[], ventanas: Intervalo[]) {
  let t = 0;
  for (const [a, b] of xs) for (const [c, d] of ventanas) {
    if (c >= b) break;
    t += Math.max(0, Math.min(b, d) - Math.max(a, c));
  }
  return t;
}

const total = (v: Intervalo[]) => v.reduce((s, [a, b]) => s + (b - a), 0);
const recortar = (v: Intervalo[], desde: number): Intervalo[] => v.filter(([, b]) => b > desde).map(([a, b]) => [Math.max(a, desde), b]);

@Injectable()
export class KpiService {
  constructor(private readonly ds: DataSource, private readonly audit: AuditService) {}

  async parametros(): Promise<ParametrosKpi> {
    const s = await this.ds.getRepository(Setting).findOne({ where: { clave: PARAM_INDICADORES } });
    if (!s?.valor) return PARAMETROS_POR_DEFECTO;
    const v = JSON.parse(s.valor) as Partial<ParametrosKpi>;
    return { ...PARAMETROS_POR_DEFECTO, ...v, metas: { ...PARAMETROS_POR_DEFECTO.metas, ...v.metas } };
  }

  async guardarParametros(p: ParametrosKpi, actor: SessionUser) {
    const dias = [...new Set(p.dias)].sort();
    const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
    if (min(p.horaFin) <= min(p.horaInicio)) throw new BadRequestException('La hora de fin debe ser posterior a la de inicio');
    const nuevo: ParametrosKpi = { dias, horaInicio: p.horaInicio, horaFin: p.horaFin, metas: { ...PARAMETROS_POR_DEFECTO.metas, ...p.metas } };
    await this.ds.transaction(async (em) => {
      const r = em.getRepository(Setting);
      const anterior = await r.findOne({ where: { clave: PARAM_INDICADORES } });
      await r.save({ clave: PARAM_INDICADORES, valor: JSON.stringify(nuevo) });
      await this.audit.log({
        usuarioId: actor.id, accion: 'PARAMETROS_INDICADORES', entidad: 'parametro', entidadId: PARAM_INDICADORES,
        detalle: { anterior: anterior?.valor ? JSON.parse(anterior.valor) : null, nuevo } as never,
      }, em);
    });
    return nuevo;
  }

  /**
   * KPI-01 a KPI-06 para el período [desde, hasta] (fechas de la planta, ambos días incluidos).
   * Ver docs/decisiones-asumidas.md (D-05) para el detalle de cada fórmula.
   */
  async calcular(desde: string, hasta: string, ahora = Date.now()) {
    if (hasta < desde) throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    if (Date.parse(hasta) - Date.parse(desde) > 400 * 86_400_000) throw new BadRequestException('El período no puede superar un año');
    const p = await this.parametros();
    const tz = TZ();
    const inicio = local(desde, '00:00', tz);
    const fin = Math.min(local(sumarDias(hasta, 1), '00:00', tz), ahora);
    const ventanas = ventanasProduccion(desde, hasta, p, fin);
    const ini = new Date(inicio).toISOString();
    const finIso = new Date(local(sumarDias(hasta, 1), '00:00', tz)).toISOString();

    // ---------- Máquinas y paradas (KPI-01, 02, 03) ----------
    const maquinas: Array<{ id: string; codigo: string; nombre: string; area: string; estado: string; creado: Date }> = await this.ds.query(
      `SELECT id, codigo, nombre, area, estado, creado_en AS creado FROM activos
        WHERE creado_en < $1 AND (estado NOT IN ('DADO_DE_BAJA', 'EN_BODEGA') OR id IN (SELECT activo_id FROM ordenes_trabajo WHERE creado_en >= $2))
        ORDER BY codigo`,
      [finIso, ini],
    );
    // D-05: una OT cancelada no cuenta como parada ni como falla (suele ser un reporte duplicado o equivocado).
    const paradas: Array<{ activo: string; a: Date; b: Date | null }> = await this.ds.query(
      `SELECT activo_id AS activo, inicio_parada AS a, fin_parada AS b FROM ordenes_trabajo
        WHERE maquina_parada AND inicio_parada IS NOT NULL AND estado <> 'CANCELADA'
          AND inicio_parada < $2 AND (fin_parada IS NULL OR fin_parada > $1)`,
      [ini, finIso],
    );
    const fallas: Array<{ activo: string; n: string }> = await this.ds.query(
      `SELECT activo_id AS activo, COUNT(*) AS n FROM ordenes_trabajo
        WHERE tipo = 'CORRECTIVO' AND estado <> 'CANCELADA' AND COALESCE(inicio_parada, creado_en) >= $1 AND COALESCE(inicio_parada, creado_en) < $2
        GROUP BY activo_id`,
      [ini, finIso],
    );
    // MTTR: con la máquina parada, desde que paró hasta que volvió a operar; sin parada, desde que se inició el trabajo hasta el cierre.
    const reparaciones: Array<{ activo: string; n: string; horas: string }> = await this.ds.query(
      `SELECT activo_id AS activo, COUNT(*) AS n,
              SUM(EXTRACT(EPOCH FROM CASE WHEN maquina_parada AND inicio_parada IS NOT NULL AND fin_parada IS NOT NULL
                                          THEN fin_parada - inicio_parada
                                          ELSE cerrada_en - COALESCE(iniciada_en, creado_en) END)) / 3600 AS horas
         FROM ordenes_trabajo
        WHERE tipo = 'CORRECTIVO' AND estado = 'CERRADA' AND cerrada_en >= $1 AND cerrada_en < $2
        GROUP BY activo_id`,
      [ini, finIso],
    );

    const nFallas = new Map(fallas.map((f) => [f.activo, Number(f.n)]));
    const nRep = new Map(reparaciones.map((r) => [r.activo, { n: Number(r.n), horas: Math.max(0, Number(r.horas)) }]));
    const filas = maquinas.map((m) => {
      const propias = recortar(ventanas, new Date(m.creado).getTime());
      const planificado = total(propias);
      const paro = unir(paradas.filter((x) => x.activo === m.id).map((x): Intervalo => [new Date(x.a).getTime(), x.b ? new Date(x.b).getTime() : ahora]));
      const parada = cruce(paro, propias);
      const operacion = planificado - parada;
      const nf = nFallas.get(m.id) ?? 0;
      const rep = nRep.get(m.id) ?? { n: 0, horas: 0 };
      return {
        id: m.id, codigo: m.codigo, nombre: m.nombre, area: m.area, estado: m.estado,
        horasPlanificadas: r1(planificado / HORA), horasParada: r2(parada / HORA),
        disponibilidad: pct(operacion, planificado),
        fallas: nf, mtbfHoras: nf ? r1(operacion / HORA / nf) : null,
        reparaciones: rep.n, mttrHoras: rep.n ? r2(rep.horas / rep.n) : null,
        _op: operacion, _plan: planificado, _rep: rep.horas,
      };
    });
    const sum = (k: '_op' | '_plan' | '_rep' | 'fallas' | 'reparaciones') => filas.reduce((s, f) => s + f[k], 0);
    const [op, plan, horasRep, nf, nr] = [sum('_op'), sum('_plan'), sum('_rep'), sum('fallas'), sum('reparaciones')];

    // ---------- Preventivos (KPI-04) ----------
    const hoyStr = hoyLocal(tz);
    const prev: Array<{ estado: string; fecha: string; cierre: string | null }> = await this.ds.query(
      `SELECT estado, to_char(fecha_programada, 'YYYY-MM-DD') AS fecha, to_char(cerrada_en AT TIME ZONE $3, 'YYYY-MM-DD') AS cierre
         FROM ordenes_trabajo WHERE tipo = 'PREVENTIVO' AND fecha_programada BETWEEN $1::date AND $2::date`,
      [desde, hasta, tz],
    );
    const aTiempo = prev.filter((x) => x.estado === 'CERRADA' && x.cierre! <= x.fecha).length;
    const tarde = prev.filter((x) => x.estado === 'CERRADA' && x.cierre! > x.fecha).length;
    const cancelados = prev.filter((x) => x.estado === 'CANCELADA').length;
    const abiertos = prev.filter((x) => x.estado !== 'CERRADA' && x.estado !== 'CANCELADA');
    const vencidos = abiertos.filter((x) => x.fecha < hoyStr).length;
    const enPlazo = abiertos.length - vencidos;

    // ---------- Inventario (KPI-05) ----------
    // El valor del inventario en un instante es la suma de sus movimientos valorizados (costo promedio ponderado, D-04).
    const [inv] = await this.ds.query(
      `SELECT COALESCE(SUM(cantidad * costo_unitario) FILTER (WHERE creado_en < $1), 0) AS inicial,
              COALESCE(SUM(cantidad * costo_unitario) FILTER (WHERE creado_en < $2), 0) AS final,
              COALESCE(-SUM(cantidad * costo_unitario) FILTER (WHERE tipo = 'SALIDA_CONSUMO' AND creado_en >= $1 AND creado_en < $2), 0) AS consumo
         FROM movimientos_inventario`,
      [ini, finIso],
    );
    const valorInicial = Number(inv.inicial);
    const valorFinal = Number(inv.final);
    const promedio = (valorInicial + valorFinal) / 2;
    const consumo = Number(inv.consumo);
    const diasPeriodo = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;
    const rotacion = promedio > 0 ? r2(consumo / promedio) : null;

    // ---------- Estado actual del inventario (KPI-06) ----------
    const repuestos: Array<{ id: string; codigo: string; descripcion: string; unidad: string; minimo: string; costo: string; stock: string }> = await this.ds.query(
      `SELECT r.id, r.codigo, r.descripcion, r.unidad, r.stock_minimo AS minimo, r.costo_promedio AS costo, COALESCE(SUM(m.cantidad), 0) AS stock
         FROM repuestos r LEFT JOIN movimientos_inventario m ON m.repuesto_id = r.id
        WHERE r.activo GROUP BY r.id ORDER BY r.codigo`,
    );
    const bajo = repuestos.filter((r) => Number(r.stock) < Number(r.minimo));

    const metas = p.metas;
    return {
      periodo: { desde, hasta, dias: diasPeriodo, calculadoEn: new Date(ahora).toISOString() },
      parametros: p,
      global: {
        maquinas: filas.length,
        horasPlanificadas: r1(plan / HORA),
        horasParada: r2((plan - op) / HORA),
        disponibilidad: pct(op, plan),
        fallas: nf,
        mtbfHoras: nf ? r1(op / HORA / nf) : null,
        reparaciones: nr,
        mttrHoras: nr ? r2(horasRep / nr) : null,
        preventivos: {
          programados: prev.length, aTiempo, tarde, vencidos, enPlazo, cancelados,
          cumplimiento: pct(aTiempo, aTiempo + tarde + vencidos),
        },
        inventario: {
          consumo: r2(consumo), valorInicial: r2(valorInicial), valorFinal: r2(valorFinal), valorPromedio: r2(promedio),
          rotacion, diasCobertura: rotacion ? r1(diasPeriodo / rotacion) : null,
        },
      },
      metas,
      maquinas: filas
        .map(({ _op, _plan, _rep, ...f }) => f)
        .sort((a, b) => b.fallas - a.fallas || (a.disponibilidad ?? 100) - (b.disponibilidad ?? 100) || a.codigo.localeCompare(b.codigo)),
      inventarioActual: {
        repuestos: repuestos.length,
        valorTotal: r2(repuestos.reduce((s, r) => s + Math.max(Number(r.stock), 0) * Number(r.costo), 0)),
        bajoMinimo: bajo.length,
        sinStock: repuestos.filter((r) => Number(r.stock) <= 0).length,
        criticos: bajo
          .map((r) => ({ id: r.id, codigo: r.codigo, descripcion: r.descripcion, unidad: r.unidad, stock: Number(r.stock), minimo: Number(r.minimo) }))
          .sort((a, b) => a.stock - a.minimo - (b.stock - b.minimo))
          .slice(0, 10),
      },
    };
  }
}
