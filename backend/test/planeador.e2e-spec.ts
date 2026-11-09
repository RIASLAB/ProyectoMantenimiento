/** D-36 · Planeador anual de mantenimiento (AC-PMT-CR01) y reprogramación de preventivos. */
import { bootstrap, VERIF_OK } from './util';
import { hoy } from '../src/maintenance/maintenance.service';
import { semanaIso, semanasDelAnio, lunesDeSemana, mesDeSemana } from '../src/planner/semanas';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let tec: { id: string; token: string };
const dias = (n: number) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const post = (path: string, body: object, token = c.admin) => c.http.post(`/api${path}`).set(c.auth(token)).send(body);
const get = (path: string, token = c.admin) => c.http.get(`/api${path}`).set(c.auth(token));

beforeAll(async () => {
  c = await bootstrap();
  tec = await c.usuario('tec1', 'TECNICO', '5931');
});
afterAll(() => c.app.close());

describe('D-36 · Semanas ISO del planeador', () => {
  it('2026 tiene 53 semanas; la 1 empieza el lunes 29/12/2025', () => {
    expect(semanasDelAnio(2026)).toBe(53);
    expect(semanasDelAnio(2025)).toBe(52);
    expect(lunesDeSemana(2026, 1)).toBe('2025-12-29');
    expect(semanaIso('2026-01-01')).toEqual({ anio: 2026, semana: 1 });
    expect(semanaIso('2026-11-09')).toEqual({ anio: 2026, semana: 46 });
    expect(semanaIso('2027-01-01')).toEqual({ anio: 2026, semana: 53 });
    expect(mesDeSemana(2026, 1)).toBe(1);
    expect(mesDeSemana(2026, 14)).toBe(4);
  });
});

describe('D-36 · Planeador y reprogramación', () => {
  const evap: string[] = [];
  const ordenes: string[] = [];
  const anio = semanaIso(dias(7)).anio;
  const w = (f: string) => semanaIso(f).semana;

  beforeAll(async () => {
    for (const n of [1, 2, 3]) {
      const a = (await post('/activos', { codigo: `EVAP-PAS-0${n}`, nombre: `Evaporador pasillo ${n}`, area: 'Planta Pollo' }).expect(201)).body;
      evap.push(a.id);
      const r = (await post('/planes', { activoId: a.id, nombre: 'Lavado de evaporador', frecuenciaValor: 3, frecuenciaUnidad: 'MESES', primeraFecha: dias(7), repuestos: [] }).expect(201)).body;
      ordenes.push(r.primeraOrden.id);
    }
    const mol = (await post('/activos', { codigo: 'MOL-01', nombre: 'Molino', area: 'Planta Pollo' }).expect(201)).body;
    await post('/planes', { activoId: mol.id, nombre: 'Lubricación del molino', frecuenciaValor: 1, frecuenciaUnidad: 'MESES', primeraFecha: dias(7), repuestos: [] }).expect(201);
    const otra = (await post('/activos', { codigo: 'DES-01', nombre: 'Descueradora', area: 'Desposte' }).expect(201)).body;
    await post('/planes', { activoId: otra.id, nombre: 'Engrase', frecuenciaValor: 6, frecuenciaUnidad: 'MESES', primeraFecha: dias(7), repuestos: [] }).expect(201);
  });

  it('agrupa las máquinas del mismo equipo y plan, como el Excel, y proyecta el año', async () => {
    expect((await get('/planeador/areas')).body).toEqual(['Desposte', 'Planta Pollo']);
    const r = await get(`/planeador?area=planta%20pollo&anio=${anio}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ anio, meta: 99 });
    expect(r.body.semanas).toHaveLength(semanasDelAnio(anio));
    const fila = r.body.filas.find((f: { equipo: string }) => f.equipo === 'Evaporador pasillo');
    expect(fila).toMatchObject({ cantidad: 3, frecuenciaTexto: 'trimestral', plan: 'Lavado de evaporador', actividad: 'Lavado de evaporador' });
    expect(fila.semanas[w(dias(7))]).toMatchObject({ p: 3, e: 0 });
    expect(fila.maquinas.map((m: { codigo: string }) => m.codigo)).toEqual(['EVAP-PAS-01', 'EVAP-PAS-02', 'EVAP-PAS-03']);
    expect(r.body.filas.map((f: { equipo: string }) => f.equipo)).toEqual(['Evaporador pasillo', 'Molino']);
    // Lo que el plan programará después de la orden pendiente, si cae en este año
    const mol = r.body.filas.find((f: { equipo: string }) => f.equipo === 'Molino');
    const siguiente = new Date(Date.parse(`${dias(7)}T00:00:00Z`)); siguiente.setUTCMonth(siguiente.getUTCMonth() + 1);
    const sig = siguiente.toISOString().slice(0, 10);
    if (semanaIso(sig).anio === anio) expect(mol.semanas[w(sig)].proyectadas).toBe(1);
  });

  it('solo el administrador reprograma, solo preventivos sin empezar, a una fecha futura y con motivo', async () => {
    const [o1] = ordenes;
    expect((await post(`/ordenes/${o1}/reprogramar`, { fecha: dias(14), motivo: 'Producción no libera el cuarto' }, tec.token)).status).toBe(403);
    expect((await post(`/ordenes/${o1}/reprogramar`, { fecha: dias(-1), motivo: 'Producción no libera el cuarto' })).body.message).toContain('pasado');
    expect((await post(`/ordenes/${o1}/reprogramar`, { fecha: dias(400), motivo: 'Producción no libera el cuarto' })).body.message).toContain('más de un año');
    expect((await post(`/ordenes/${o1}/reprogramar`, { fecha: dias(14), motivo: 'x' })).status).toBe(400);
    const corr = (await post('/ordenes', { activoId: evap[0], descripcion: 'Gotea agua', maquinaParada: false })).body;
    expect((await post(`/ordenes/${corr.id}/reprogramar`, { fecha: dias(14), motivo: 'Producción no libera el cuarto' })).body.message).toContain('preventivas');
    await post(`/ordenes/${corr.id}/cancelar`, { motivo: 'Prueba' }).expect(201);

    const r = await post(`/ordenes/${o1}/reprogramar`, { fecha: dias(14), motivo: 'Producción no libera el cuarto' });
    expect(r.status).toBe(201);
    const o = (await get(`/ordenes/${o1}`)).body;
    expect(o.fechaProgramada).toBe(dias(14));
    expect(JSON.stringify(o.eventos)).toContain(`Reprogramado del ${dias(7).split('-').reverse().join('/')} al ${dias(14).split('-').reverse().join('/')}: Producción no libera el cuarto`);
  });

  it('la ejecutada se marca en la semana en que se hizo; la reprogramada se mueve y deja su observación', async () => {
    const [, o2, o3] = ordenes;
    await post(`/ordenes/${o2}/asignar`, { tecnicoId: tec.id }).expect(201);
    await post(`/ordenes/${o2}/iniciar`, {}, tec.token).expect(201);
    await post(`/ordenes/${o2}/cerrar`, { ...VERIF_OK, trabajoRealizado: 'Lavado de serpentín y bandeja', repuestosUsados: [], manoObra: [] }, tec.token).expect(201);
    await post(`/ordenes/${o3}/cancelar`, { motivo: 'Equipo trasladado a otra planta' }).expect(201);

    const corte = w(dias(14)) >= w(hoy()) ? w(dias(14)) : semanasDelAnio(anio);
    const r = (await get(`/planeador?area=Planta%20Pollo&anio=${anio}&corte=${corte}`)).body;
    const fila = r.filas.find((f: { equipo: string }) => f.equipo === 'Evaporador pasillo');
    if (semanaIso(hoy()).anio === anio) expect(fila.semanas[w(hoy())].e).toBe(1);
    expect(fila.semanas[w(dias(14))].p).toBeGreaterThanOrEqual(1);
    expect(fila.observaciones.join(' ')).toContain(`reprogramada de S${w(dias(7))} a S${w(dias(14))}: Producción no libera el cuarto`);
    expect(fila.observaciones.join(' ')).toContain('cancelada');
    expect(fila.observaciones.join(' ')).toContain('Equipo trasladado a otra planta');
    const maq = fila.maquinas.find((m: { codigo: string }) => m.codigo === 'EVAP-PAS-02');
    expect(Object.values(maq.semanas).some((s) => (s as { e: unknown[] }).e.length === 1)).toBe(true);
    expect(r.resumen.programadasCorte).toBeGreaterThan(0);
    expect(r.resumen.ejecutadasCorte).toBe(semanaIso(hoy()).anio === anio ? 1 : 0);
    expect((await get('/planeador?area=Planta%20Pollo&corte=99')).status).toBe(400);
    expect((await get('/planeador')).status).toBe(400);
  });

  it('la máquina con una orden reprogramada sin trabajo se puede eliminar', async () => {
    await c.http.delete(`/api/activos/${evap[0]}`).set(c.auth(c.admin)).expect(200);
  });
});
