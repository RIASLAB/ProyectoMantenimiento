/**
 * Indicadores (KPI-01 a KPI-06) contra un cálculo hecho a mano.
 *
 * Semana del lunes 2 al domingo 8 de marzo de 2026, hora de Bogotá.
 * Calendario de producción: lunes a viernes de 06:00 a 22:00 (16 h/día → 80 h por máquina).
 *
 * M1 (desde enero): paradas
 *   A lun 08:00–10:00                → 2 h en producción, reparación 2 h
 *   B mar 21:00 – mié 07:00          → 1 h (mar 21–22) + 1 h (mié 06–07) = 2 h, reparación 10 h
 *   C mar 12:00–14:00, CANCELADA     → no cuenta
 *   D sáb 10:00–12:00                → 0 h (sábado no se produce), sí es falla, reparación 2 h
 *   Disponibilidad (80 − 4) / 80 = 95 %; MTBF 76 / 3 = 25,3 h; MTTR (2 + 10 + 2) / 3 = 4,67 h
 * M2 (desde enero): falla sin parada el jue, trabajo de 10:00 a 13:00
 *   Disponibilidad 100 %; MTBF 80 / 1 = 80 h; MTTR 3 h
 * M3 (creada el jue 5 a las 10:00 → 12 h jue + 16 h vie = 28 h): parada desde vie 20:00 sin cerrar → 2 h
 *   Disponibilidad 26 / 28 = 92,9 %; MTBF 26 h
 * M4 dada de baja: no aparece.
 * Global: (188 − 6) / 188 = 96,8 %; MTBF 182 / 5 = 36,4 h; MTTR (2 + 10 + 2 + 3) / 4 = 4,25 h
 *
 * Preventivos: mar a tiempo, mié cerrado el vie (tarde), jue sin cerrar (vencido), vie cancelado
 *   Cumplimiento 1 / 3 = 33,3 %
 *
 * Inventario (R1, costo promedio ponderado):
 *   01-feb entrada 10 × 100 → 1.000 (valor inicial)
 *   mar −4 × 100 → 600; mié +5 × 130 → 1.250; jue −2 × 113,64 → 1.022,72 (valor final)
 *   10-mar −1 (fuera del período)
 *   Consumo 400 + 227,28 = 627,28; promedio (1.000 + 1.022,72) / 2 = 1.011,36; rotación 0,62
 */
import { DataSource } from 'typeorm';
import { bootstrap } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let ds: DataSource;
let tec: { token: string };
let aut: { token: string };
const ids: Record<string, string> = {};

const L = (s: string) => `2026-03-${s}-05`; // "02 08:00" → hora de Bogotá

async function maquina(codigo: string, creado: string, estado = 'OPERATIVO') {
  const [r] = await ds.query(`INSERT INTO activos (codigo, nombre, area, estado, creado_en) VALUES ($1, $2, 'Proceso', $3, $4) RETURNING id`, [codigo, `Máquina ${codigo}`, estado, creado]);
  ids[codigo] = r.id;
}

async function ot(activo: string, v: Record<string, unknown>) {
  const cols = ['activo_id', 'descripcion', ...Object.keys(v)];
  const vals = [ids[activo], 'Prueba', ...Object.values(v)];
  await ds.query(`INSERT INTO ordenes_trabajo (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
}

async function mov(tipo: string, cantidad: number, costo: number, creado: string) {
  await ds.query(`INSERT INTO movimientos_inventario (repuesto_id, tipo, cantidad, costo_unitario, creado_en) VALUES ($1, $2, $3, $4, $5)`, [ids.R1, tipo, cantidad, costo, creado]);
}

beforeAll(async () => {
  c = await bootstrap();
  ds = c.app.get(DataSource);
  tec = await c.usuario('tec', 'TECNICO', '5821');
  aut = await c.usuario('aut', 'AUTORIZADOR', 'Autoriza2026');

  await maquina('M1', '2026-01-01T00:00:00Z');
  await maquina('M2', '2026-01-01T00:00:00Z');
  await maquina('M3', L('05 10:00'));
  await maquina('M4', '2026-01-01T00:00:00Z', 'DADO_DE_BAJA');

  const correctivo = { tipo: 'CORRECTIVO', estado: 'CERRADA', maquina_parada: true };
  await ot('M1', { ...correctivo, inicio_parada: L('02 08:00'), fin_parada: L('02 10:00'), creado_en: L('02 08:05'), iniciada_en: L('02 08:30'), cerrada_en: L('02 10:10') });
  await ot('M1', { ...correctivo, inicio_parada: L('03 21:00'), fin_parada: L('04 07:00'), creado_en: L('03 21:00'), iniciada_en: L('03 21:30'), cerrada_en: L('04 07:15') });
  await ot('M1', { ...correctivo, estado: 'CANCELADA', inicio_parada: L('03 12:00'), fin_parada: L('03 14:00'), creado_en: L('03 12:00'), cerrada_en: L('03 14:00') });
  await ot('M1', { ...correctivo, inicio_parada: L('07 10:00'), fin_parada: L('07 12:00'), creado_en: L('07 10:00'), iniciada_en: L('07 10:15'), cerrada_en: L('07 12:30') });
  await ot('M2', { tipo: 'CORRECTIVO', estado: 'CERRADA', maquina_parada: false, creado_en: L('05 09:00'), iniciada_en: L('05 10:00'), cerrada_en: L('05 13:00') });
  await ot('M3', { tipo: 'CORRECTIVO', estado: 'EN_EJECUCION', maquina_parada: true, inicio_parada: L('06 20:00'), creado_en: L('06 20:00'), iniciada_en: L('06 20:30') });

  const prev = { tipo: 'PREVENTIVO' };
  await ot('M2', { ...prev, estado: 'CERRADA', fecha_programada: '2026-03-03', cerrada_en: L('03 15:00') });
  await ot('M2', { ...prev, estado: 'CERRADA', fecha_programada: '2026-03-04', cerrada_en: L('06 09:00') });
  await ot('M2', { ...prev, estado: 'ASIGNADA', fecha_programada: '2026-03-05' });
  await ot('M2', { ...prev, estado: 'CANCELADA', fecha_programada: '2026-03-06', cerrada_en: L('06 09:00') });
  await ot('M2', { ...prev, estado: 'ASIGNADA', fecha_programada: '2026-03-20' }); // fuera del período

  const [r] = await ds.query(`INSERT INTO repuestos (codigo, descripcion, unidad, stock_minimo, costo_promedio) VALUES ('R1', 'Rodamiento', 'UND', 10, 113.64) RETURNING id`);
  ids.R1 = r.id;
  await mov('ENTRADA_COMPRA', 10, 100, '2026-02-01T12:00:00Z');
  await mov('SALIDA_CONSUMO', -4, 100, L('03 09:00'));
  await mov('ENTRADA_COMPRA', 5, 130, L('04 09:00'));
  await mov('SALIDA_CONSUMO', -2, 113.64, L('05 09:00'));
  await mov('SALIDA_CONSUMO', -1, 113.64, L('10 09:00'));

  await c.http.put('/api/indicadores/parametros').set(c.auth(c.admin))
    .send({ dias: [1, 2, 3, 4, 5], horaInicio: '06:00', horaFin: '22:00', metas: { disponibilidad: 95, cumplimiento: 90 } })
    .expect(200);
});

afterAll(async () => {
  await c?.app.close();
});

const semana = () => c.http.get('/api/indicadores?desde=2026-03-02&hasta=2026-03-08').set(c.auth(c.admin));
type Maq = { codigo: string; horasPlanificadas: number; horasParada: number; disponibilidad: number | null; fallas: number; mtbfHoras: number | null; reparaciones: number; mttrHoras: number | null };

describe('KPI-01 · Disponibilidad', () => {
  it('por máquina coincide con el cálculo manual (calendario, paradas unidas, canceladas fuera)', async () => {
    const r = await semana();
    expect(r.status).toBe(200);
    const m = Object.fromEntries((r.body.maquinas as Maq[]).map((x) => [x.codigo, x]));
    expect(Object.keys(m).sort()).toEqual(['M1', 'M2', 'M3']);
    expect(m.M1).toMatchObject({ horasPlanificadas: 80, horasParada: 4, disponibilidad: 95 });
    expect(m.M2).toMatchObject({ horasPlanificadas: 80, horasParada: 0, disponibilidad: 100 });
    expect(m.M3).toMatchObject({ horasPlanificadas: 28, horasParada: 2, disponibilidad: 92.9 });
  });

  it('global', async () => {
    expect((await semana()).body.global).toMatchObject({ maquinas: 3, horasPlanificadas: 188, horasParada: 6, disponibilidad: 96.8 });
  });

  it('el período es seleccionable: solo el lunes', async () => {
    const r = await c.http.get('/api/indicadores?desde=2026-03-02&hasta=2026-03-02').set(c.auth(c.admin));
    const m1 = (r.body.maquinas as Maq[]).find((x) => x.codigo === 'M1')!;
    expect(m1).toMatchObject({ horasPlanificadas: 16, horasParada: 2, disponibilidad: 87.5, fallas: 1 });
    expect(r.body.maquinas.map((x: Maq) => x.codigo)).not.toContain('M3'); // aún no existía
  });

  it('con el calendario de 24 horas toda la parada cuenta', async () => {
    await c.http.put('/api/indicadores/parametros').set(c.auth(c.admin)).send({ dias: [1, 2, 3, 4, 5, 6, 7], horaInicio: '00:00', horaFin: '24:00', metas: { disponibilidad: 95, cumplimiento: 90 } }).expect(200);
    const m1 = ((await semana()).body.maquinas as Maq[]).find((x) => x.codigo === 'M1')!;
    // 168 h; paradas 2 + 10 + 2 = 14 h
    expect(m1).toMatchObject({ horasPlanificadas: 168, horasParada: 14, disponibilidad: 91.7 });
    await c.http.put('/api/indicadores/parametros').set(c.auth(c.admin)).send({ dias: [1, 2, 3, 4, 5], horaInicio: '06:00', horaFin: '22:00', metas: { disponibilidad: 95, cumplimiento: 90 } }).expect(200);
  });
});

describe('KPI-02/03 · MTBF y MTTR', () => {
  it('por máquina', async () => {
    const m = Object.fromEntries(((await semana()).body.maquinas as Maq[]).map((x) => [x.codigo, x]));
    expect(m.M1).toMatchObject({ fallas: 3, mtbfHoras: 25.3, reparaciones: 3, mttrHoras: 4.67 });
    expect(m.M2).toMatchObject({ fallas: 1, mtbfHoras: 80, reparaciones: 1, mttrHoras: 3 });
    expect(m.M3).toMatchObject({ fallas: 1, mtbfHoras: 26, reparaciones: 0, mttrHoras: null });
  });

  it('global', async () => {
    expect((await semana()).body.global).toMatchObject({ fallas: 5, mtbfHoras: 36.4, reparaciones: 4, mttrHoras: 4.25 });
  });

  it('KPI-06 · las máquinas que más fallan van primero', async () => {
    expect(((await semana()).body.maquinas as Maq[]).map((x) => x.codigo)).toEqual(['M1', 'M3', 'M2']);
  });
});

describe('KPI-04 · Cumplimiento de preventivos', () => {
  it('a tiempo / (a tiempo + tarde + vencidos); cancelados aparte', async () => {
    expect((await semana()).body.global.preventivos).toEqual({ programados: 4, aTiempo: 1, tarde: 1, vencidos: 1, enPlazo: 0, cancelados: 1, cumplimiento: 33.3 });
  });
});

describe('KPI-05/06 · Inventario', () => {
  it('rotación = consumo del período / inventario promedio', async () => {
    expect((await semana()).body.global.inventario).toEqual({
      consumo: 627.28, valorInicial: 1000, valorFinal: 1022.72, valorPromedio: 1011.36, rotacion: 0.62, diasCobertura: 11.3,
    });
  });

  it('resumen actual: valor total y repuestos bajo el mínimo', async () => {
    const r = (await semana()).body.inventarioActual;
    expect(r).toMatchObject({ repuestos: 1, valorTotal: 909.12, bajoMinimo: 1, sinStock: 0 });
    expect(r.criticos[0]).toMatchObject({ codigo: 'R1', stock: 8, minimo: 10 });
  });
});

describe('KPI-07 · Parámetros y metas', () => {
  it('las metas viajan con los indicadores', async () => {
    expect((await semana()).body.metas).toEqual({ disponibilidad: 95, mtbf: null, mttr: null, cumplimiento: 90, rotacion: null });
  });

  it('el cambio de parámetros queda en bitácora', async () => {
    const b = await c.http.get('/api/bitacora?entidad=parametro').set(c.auth(c.admin));
    expect(b.body.items.some((x: { accion: string }) => x.accion === 'PARAMETROS_INDICADORES')).toBe(true);
  });

  it('valida el horario y los días', async () => {
    const put = (body: object) => c.http.put('/api/indicadores/parametros').set(c.auth(c.admin)).send({ dias: [1], horaInicio: '06:00', horaFin: '22:00', metas: {}, ...body });
    expect((await put({ horaFin: '05:00' })).status).toBe(400);
    expect((await put({ dias: [] })).status).toBe(400);
    expect((await put({ dias: [8] })).status).toBe(400);
    expect((await put({ horaInicio: '6:00' })).status).toBe(400);
    expect((await put({ metas: { disponibilidad: 120 } })).status).toBe(400);
  });

  it('valida el período', async () => {
    expect((await c.http.get('/api/indicadores?desde=2026-03-08&hasta=2026-03-01').set(c.auth(c.admin))).status).toBe(400);
    expect((await c.http.get('/api/indicadores?desde=2024-01-01&hasta=2026-03-01').set(c.auth(c.admin))).status).toBe(400);
    expect((await c.http.get('/api/indicadores?desde=marzo').set(c.auth(c.admin))).status).toBe(400);
  });
});

describe('Permisos', () => {
  it('Dirección (autorizador) y administrador ven los indicadores; el técnico no', async () => {
    expect((await c.http.get('/api/indicadores').set(c.auth(aut.token))).status).toBe(200);
    expect((await c.http.get('/api/indicadores').set(c.auth(tec.token))).status).toBe(403);
  });

  it('solo el administrador cambia los parámetros', async () => {
    const r = await c.http.put('/api/indicadores/parametros').set(c.auth(aut.token)).send({ dias: [1], horaInicio: '06:00', horaFin: '22:00', metas: {} });
    expect(r.status).toBe(403);
  });
});
