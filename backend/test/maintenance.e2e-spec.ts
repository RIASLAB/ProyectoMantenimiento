/** Órdenes de trabajo y preventivos (MNT, ACT-03/04). */
import { DataSource } from 'typeorm';
import { bootstrap } from './util';
import { sumarFrecuencia, hoy } from '../src/maintenance/maintenance.service';
import { UnidadFrecuencia } from '../src/common/enums';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let op1: { id: string; token: string };
let op2: { id: string; token: string };
let tec1: { id: string; token: string };
let tec2: { id: string; token: string };
let activoId: string;
let rodId: string;
let otId: string;

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

beforeAll(async () => {
  c = await bootstrap();
  op1 = await c.usuario('op1', 'OPERARIO', '4826');
  op2 = await c.usuario('op2', 'OPERARIO', '7391');
  tec1 = await c.usuario('tec1', 'TECNICO', '5821');
  tec2 = await c.usuario('tec2', 'TECNICO', '6942');
  activoId = (await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'MOL-001', nombre: 'Molino', area: 'Proceso' })).body.id;
  rodId = (await c.http.post('/api/repuestos').set(c.auth(c.admin)).send({ codigo: 'ROD-1', descripcion: 'Rodamiento', unidad: 'UND' })).body.id;
  await c.http.post('/api/inventario/movimientos').set(c.auth(c.admin)).send({ repuestoId: rodId, tipo: 'ENTRADA_COMPRA', cantidad: 3, costoUnitario: 150 });
  await c.http.put('/api/parametros/tarifa-hora').set(c.auth(c.admin)).send({ valor: 20000 });
});

afterAll(async () => {
  await c?.app.close();
});

describe('Utilidades de fechas', () => {
  it('sumar meses respeta el fin de mes', () => {
    expect(sumarFrecuencia('2026-01-31', 1, UnidadFrecuencia.MESES)).toBe('2026-02-28');
    expect(sumarFrecuencia('2028-01-31', 1, UnidadFrecuencia.MESES)).toBe('2028-02-29');
    expect(sumarFrecuencia('2026-12-15', 2, UnidadFrecuencia.SEMANAS)).toBe('2026-12-29');
    expect(sumarFrecuencia('2026-12-30', 3, UnidadFrecuencia.DIAS)).toBe('2027-01-02');
  });
});

describe('MNT-01/02 · Reporte de falla', () => {
  it('el operario reporta con máquina parada: OT abierta, prioridad alta y máquina fuera de servicio', async () => {
    const r = await c.http.post('/api/ordenes').set(c.auth(op1.token)).send({
      activoId, descripcion: 'Ruido fuerte en el motor', maquinaParada: true, clientId: '2f6b6a0e-0c1e-4d1a-9c55-111111111111',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ tipo: 'CORRECTIVO', estado: 'ABIERTA', prioridad: 'ALTA', maquinaParada: true });
    expect(r.body.codigo).toMatch(/^OT-\d{6}$/);
    expect(r.body.inicioParada).toBeTruthy();
    otId = r.body.id;
    const a = await c.http.get(`/api/activos/${activoId}`).set(c.auth(c.admin));
    expect(a.body.estado).toBe('FUERA_DE_SERVICIO');
  });

  it('OFF-02 · reenviar el mismo reporte no crea otra OT', async () => {
    const r = await c.http.post('/api/ordenes').set(c.auth(op1.token)).send({
      activoId, descripcion: 'Ruido fuerte en el motor', maquinaParada: true, clientId: '2f6b6a0e-0c1e-4d1a-9c55-111111111111',
    });
    expect(r.body.duplicado).toBe(true);
    expect(r.body.id).toBe(otId);
  });

  it('valida la descripción', async () => {
    const r = await c.http.post('/api/ordenes').set(c.auth(op1.token)).send({ activoId, descripcion: 'x', maquinaParada: false });
    expect(r.status).toBe(400);
  });

  it('el operario solo ve sus propios reportes', async () => {
    expect((await c.http.get(`/api/ordenes/${otId}`).set(c.auth(op1.token))).status).toBe(200);
    expect((await c.http.get(`/api/ordenes/${otId}`).set(c.auth(op2.token))).status).toBe(403);
    const lista = await c.http.get('/api/ordenes').set(c.auth(op2.token));
    expect(lista.body).toHaveLength(0);
  });

  it('MNT-11 · el reportante adjunta foto del reporte, pero no fotos de ejecución', async () => {
    const ok = await c.http.post(`/api/ordenes/${otId}/fotos?momento=REPORTE`).set(c.auth(op1.token)).attach('archivo', JPG, { filename: 'falla.jpg', contentType: 'image/jpeg' });
    expect(ok.status).toBe(201);
    const no = await c.http.post(`/api/ordenes/${otId}/fotos?momento=DESPUES`).set(c.auth(op1.token)).attach('archivo', JPG, { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(no.status).toBe(403);
  });
});

describe('MNT-03/04 · Ciclo de vida y permisos', () => {
  it('el operario no puede asignar ni iniciar', async () => {
    expect((await c.http.post(`/api/ordenes/${otId}/asignar`).set(c.auth(op1.token)).send({ tecnicoId: tec1.id })).status).toBe(403);
  });

  it('un técnico toma la OT sin asignar, pero no puede asignársela a otro', async () => {
    expect((await c.http.post(`/api/ordenes/${otId}/asignar`).set(c.auth(tec1.token)).send({ tecnicoId: tec2.id })).status).toBe(403);
    const r = await c.http.post(`/api/ordenes/${otId}/asignar`).set(c.auth(tec1.token)).send({ tecnicoId: tec1.id });
    expect(r.status).toBe(201);
    const o = await c.http.get(`/api/ordenes/${otId}`).set(c.auth(tec1.token));
    expect(o.body).toMatchObject({ estado: 'ASIGNADA', asignadoA: { id: tec1.id } });
    expect(o.body.acciones).toMatchObject({ iniciar: true, cerrar: false });
  });

  it('otro técnico no puede ejecutar una OT ajena', async () => {
    expect((await c.http.post(`/api/ordenes/${otId}/iniciar`).set(c.auth(tec2.token))).status).toBe(403);
  });

  it('rechaza transiciones inválidas (cerrar sin iniciar)', async () => {
    const r = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec1.token)).send({ trabajoRealizado: 'Cambio de rodamiento', repuestosUsados: [], manoObra: [] });
    expect(r.status).toBe(400);
  });

  it('iniciar, esperar repuesto y reanudar quedan en el historial', async () => {
    await c.http.post(`/api/ordenes/${otId}/iniciar`).set(c.auth(tec1.token)).expect(201);
    await c.http.post(`/api/ordenes/${otId}/esperar-repuesto`).set(c.auth(tec1.token)).send({ nota: 'Falta rodamiento' }).expect(201);
    await c.http.post(`/api/ordenes/${otId}/reanudar`).set(c.auth(tec1.token)).expect(201);
    const o = await c.http.get(`/api/ordenes/${otId}`).set(c.auth(c.admin));
    expect(o.body.estado).toBe('EN_EJECUCION');
    expect(o.body.eventos.map((e: { estadoNuevo: string }) => e.estadoNuevo)).toEqual(['ABIERTA', 'ASIGNADA', 'EN_EJECUCION', 'ESPERANDO_REPUESTO', 'EN_EJECUCION']);
    expect(o.body.eventos[3]).toMatchObject({ nota: 'Falta rodamiento', usuario: { id: tec1.id } });
    expect(o.body.iniciadaEn).toBeTruthy();
  });
});

describe('MNT-09/10 · Cierre', () => {
  const cierre = (extra: object = {}) => ({
    trabajoRealizado: 'Cambio de rodamiento y lubricación',
    repuestosUsados: [{ repuestoId: rodId, cantidad: 2 }],
    manoObra: [{ tecnicoId: tec1.id, horas: 1.5 }],
    costoServiciosExternos: 50000,
    finParada: new Date().toISOString(),
    ...extra,
  });

  it('exige la hora de puesta en marcha si la máquina estaba parada', async () => {
    const { finParada: _f, ...sinFin } = cierre();
    expect((await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec1.token)).send(sinFin)).status).toBe(400);
  });

  it('sin stock suficiente no cierra ni descuenta nada', async () => {
    const r = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec1.token)).send(cierre({ repuestosUsados: [{ repuestoId: rodId, cantidad: 10 }] }));
    expect(r.status).toBe(400);
    expect((await c.http.get(`/api/repuestos/${rodId}`).set(c.auth(c.admin))).body.stock).toBe(3);
    expect((await c.http.get(`/api/ordenes/${otId}`).set(c.auth(c.admin))).body.estado).toBe('EN_EJECUCION');
  });

  it('descuenta los repuestos usados, calcula costos y deja la máquina operativa', async () => {
    const r = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec1.token)).send(cierre());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ costoRepuestos: 300, costoManoObra: 30000 });

    expect((await c.http.get(`/api/repuestos/${rodId}`).set(c.auth(c.admin))).body.stock).toBe(1);
    const k = await c.http.get(`/api/repuestos/${rodId}/kardex`).set(c.auth(c.admin));
    expect(k.body.movimientos.at(-1)).toMatchObject({ tipo: 'SALIDA_CONSUMO', cantidad: -2 });
    expect(k.body.movimientos.at(-1).referencia).toMatch(/^OT-\d{6}$/);

    const o = await c.http.get(`/api/ordenes/${otId}`).set(c.auth(c.admin));
    expect(o.body).toMatchObject({ estado: 'CERRADA', cerradaPor: { id: tec1.id }, costoServiciosExternos: 50000 });
    expect(o.body.finParada).toBeTruthy();
    expect((await c.http.get(`/api/activos/${activoId}`).set(c.auth(c.admin))).body.estado).toBe('OPERATIVO');
  });

  it('una OT cerrada ya no admite cambios', async () => {
    expect((await c.http.post(`/api/ordenes/${otId}/cancelar`).set(c.auth(c.admin)).send({ motivo: 'Error' })).status).toBe(400);
    expect((await c.http.put(`/api/ordenes/${otId}/repuestos`).set(c.auth(c.admin)).send({ repuestos: [] })).status).toBe(400);
  });

  it('ACT-03/04 · la hoja de vida muestra la OT y el costo acumulado', async () => {
    const h = await c.http.get(`/api/activos/${activoId}/historial`).set(c.auth(c.admin));
    expect(h.body.costos).toEqual({ repuestos: 300, manoObra: 30000, externos: 50000, total: 80300 });
    expect(h.body.cerradas.correctivos).toBe(1);
    expect(h.body.ordenes[0]).toMatchObject({ id: otId, costoTotal: 80300 });
  });

  it('el historial de estados es inmutable en la base de datos', async () => {
    await expect(c.app.get(DataSource).query('DELETE FROM ot_eventos')).rejects.toThrow(/solo inserción/);
  });
});

describe('MNT-02 · Hora de puesta en marcha', () => {
  it('una diferencia de segundos por la precisión del formulario se ajusta al inicio de la parada', async () => {
    const inicio = new Date(Date.now() - 1000);
    const o = (await c.http.post('/api/ordenes').set(c.auth(op1.token)).send({ activoId, descripcion: 'Atasco en la tolva', maquinaParada: true, reportadoEn: inicio.toISOString() })).body;
    await c.http.post(`/api/ordenes/${o.id}/asignar`).set(c.auth(c.admin)).send({ tecnicoId: tec1.id }).expect(201);
    await c.http.post(`/api/ordenes/${o.id}/iniciar`).set(c.auth(tec1.token)).expect(201);
    const fin = new Date(inicio.getTime() - 30_000); // el formulario redondea al minuto
    const r = await c.http.post(`/api/ordenes/${o.id}/cerrar`).set(c.auth(tec1.token)).send({ trabajoRealizado: 'Se destrabó la tolva', repuestosUsados: [], manoObra: [], finParada: fin.toISOString() });
    expect(r.status).toBe(201);
    const d = (await c.http.get(`/api/ordenes/${o.id}`).set(c.auth(c.admin))).body;
    expect(new Date(d.finParada).getTime()).toBe(new Date(d.inicioParada).getTime());
  });

  it('pero rechaza una puesta en marcha claramente anterior a la parada', async () => {
    const o = (await c.http.post('/api/ordenes').set(c.auth(op1.token)).send({ activoId, descripcion: 'Atasco en la tolva 2', maquinaParada: true })).body;
    await c.http.post(`/api/ordenes/${o.id}/asignar`).set(c.auth(c.admin)).send({ tecnicoId: tec1.id }).expect(201);
    await c.http.post(`/api/ordenes/${o.id}/iniciar`).set(c.auth(tec1.token)).expect(201);
    const r = await c.http.post(`/api/ordenes/${o.id}/cerrar`).set(c.auth(tec1.token)).send({ trabajoRealizado: 'Se destrabó la tolva', repuestosUsados: [], manoObra: [], finParada: new Date(Date.now() - 3_600_000).toISOString() });
    expect(r.status).toBe(400);
    await c.http.post(`/api/ordenes/${o.id}/cancelar`).set(c.auth(c.admin)).send({ motivo: 'Prueba' }).expect(201);
  });
});

describe('MNT-05/06/08 · Preventivos', () => {
  let planId: string;
  let otPrev: string;
  const ayer = () => {
    const d = new Date(`${hoy()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  it('crear un plan genera la primera OT con el kit de repuestos y el técnico', async () => {
    const r = await c.http.post('/api/planes').set(c.auth(c.admin)).send({
      activoId, nombre: 'Lubricación mensual', tareas: 'Lubricar rodamientos', frecuenciaValor: 1, frecuenciaUnidad: 'MESES',
      tecnicoId: tec2.id, primeraFecha: ayer(), repuestos: [{ repuestoId: rodId, cantidad: 2 }],
    });
    expect(r.status).toBe(201);
    planId = r.body.plan.id;
    otPrev = r.body.primeraOrden.id;
    const o = await c.http.get(`/api/ordenes/${otPrev}`).set(c.auth(c.admin));
    expect(o.body).toMatchObject({ tipo: 'PREVENTIVO', estado: 'ASIGNADA', asignadoA: { id: tec2.id }, fechaProgramada: ayer() });
    expect(o.body.repuestos[0]).toMatchObject({ cantidadPlanificada: 2, stock: 1, faltante: 1 });
  });

  it('MNT-06 · el preventivo con fecha pasada aparece vencido', async () => {
    const lista = await c.http.get('/api/ordenes?tipo=PREVENTIVO').set(c.auth(c.admin));
    expect(lista.body[0]).toMatchObject({ id: otPrev, vencida: true, diasParaVencer: -1 });
    const res = await c.http.get('/api/ordenes/resumen').set(c.auth(c.admin));
    expect(res.body.preventivosVencidos).toBe(1);
  });

  it('solo el administrador crea planes', async () => {
    const r = await c.http.post('/api/planes').set(c.auth(tec1.token)).send({ activoId, nombre: 'X plan', frecuenciaValor: 1, frecuenciaUnidad: 'DIAS', primeraFecha: hoy(), repuestos: [] });
    expect(r.status).toBe(403);
  });

  it('al cerrar el preventivo se programa el siguiente con el mismo kit', async () => {
    await c.http.post(`/api/ordenes/${otPrev}/iniciar`).set(c.auth(tec2.token)).expect(201);
    const r = await c.http.post(`/api/ordenes/${otPrev}/cerrar`).set(c.auth(tec2.token)).send({
      trabajoRealizado: 'Lubricación realizada', repuestosUsados: [{ repuestoId: rodId, cantidad: 1 }], manoObra: [],
    });
    expect(r.status).toBe(201);
    const sig = r.body.siguientePreventivo;
    // Programado ayer + 1 mes: la cadencia se conserva
    expect(sig.fechaProgramada).toBe(sumarFrecuencia(ayer(), 1, UnidadFrecuencia.MESES));
    const o = await c.http.get(`/api/ordenes/${sig.id}`).set(c.auth(c.admin));
    expect(o.body).toMatchObject({ estado: 'ASIGNADA', plan: { id: planId } });
    expect(o.body.repuestos[0].cantidadPlanificada).toBe(2);

    const cerrada = await c.http.get(`/api/ordenes/${otPrev}`).set(c.auth(c.admin));
    expect(cerrada.body.repuestos[0]).toMatchObject({ cantidadPlanificada: 2, cantidadUsada: 1 });
  });

  it('un plan inactivo no genera más órdenes', async () => {
    await c.http.patch(`/api/planes/${planId}`).set(c.auth(c.admin)).send({ vigente: false }).expect(200);
    const abierta = (await c.http.get('/api/ordenes?tipo=PREVENTIVO').set(c.auth(c.admin))).body[0];
    const r = await c.http.post(`/api/ordenes/${abierta.id}/cancelar`).set(c.auth(c.admin)).send({ motivo: 'Plan suspendido' });
    expect(r.body.siguientePreventivo).toBeNull();
  });
});
