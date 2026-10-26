/** Solicitudes de compra (COM-01 a COM-08). */
import { bootstrap } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
type U = { id: string; token: string };
let c: Ctx;
let tec: U;
let aut: U;
let aut2: U;
let op: U;
let activoId: string;
let rodId: string;

beforeAll(async () => {
  c = await bootstrap();
  tec = await c.usuario('tec', 'TECNICO', '5821');
  aut = await c.usuario('aut', 'AUTORIZADOR', 'Autoriza2026');
  aut2 = await c.usuario('aut2', 'AUTORIZADOR', 'Autoriza2027');
  op = await c.usuario('op1', 'OPERARIO', '4826');
  await c.http.put('/api/parametros/autorizador').set(c.auth(c.admin)).send({ usuarioId: aut.id }).expect(200);
  activoId = (await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'EMB-1', nombre: 'Embutidora', area: 'Proceso' })).body.id;
  rodId = (await c.http.post('/api/repuestos').set(c.auth(c.admin)).send({ codigo: 'ROD-1', descripcion: 'Rodamiento', unidad: 'UND' })).body.id;
  await c.http.post('/api/inventario/movimientos').set(c.auth(c.admin)).send({ repuestoId: rodId, tipo: 'ENTRADA_COMPRA', cantidad: 1, costoUnitario: 100 });
});

afterAll(async () => {
  await c?.app.close();
});

let otId: string;
let scId: string;

describe('COM-01 · Solicitud automática por faltante', () => {
  it('stock 1 y el kit pide 3 → se solicita la diferencia (2) ligada a la OT', async () => {
    const r = await c.http.post('/api/planes').set(c.auth(c.admin)).send({
      activoId, nombre: 'Cambio de rodamientos', frecuenciaValor: 3, frecuenciaUnidad: 'MESES', tecnicoId: tec.id,
      primeraFecha: '2030-01-15', repuestos: [{ repuestoId: rodId, cantidad: 3 }],
    });
    expect(r.status).toBe(201);
    otId = r.body.primeraOrden.id;
    expect(r.body.primeraOrden.solicitudesCreadas).toHaveLength(1);

    const l = await c.http.get(`/api/compras?ordenId=${otId}`).set(c.auth(c.admin));
    expect(l.body).toHaveLength(1);
    expect(l.body[0]).toMatchObject({ origen: 'AUTOMATICA', estado: 'PENDIENTE', cantidad: 2, repuesto: { codigo: 'ROD-1' } });
    expect(l.body[0].codigo).toMatch(/^SC-\d{6}$/);
    expect(l.body[0].orden.codigo).toMatch(/^OT-\d{6}$/);
    scId = l.body[0].id;
  });

  it('no se duplica: al subir lo planificado se ajusta la misma solicitud pendiente', async () => {
    await c.http.put(`/api/ordenes/${otId}/repuestos`).set(c.auth(c.admin)).send({ repuestos: [{ repuestoId: rodId, cantidad: 4 }] }).expect(200);
    await c.http.post(`/api/ordenes/${otId}/iniciar`).set(c.auth(tec.token)).expect(201);
    const l = await c.http.get(`/api/compras?ordenId=${otId}`).set(c.auth(c.admin));
    expect(l.body).toHaveLength(1);
    expect(l.body[0].cantidad).toBe(3);
  });

  it('la solicitud queda registrada en el historial de la OT', async () => {
    const o = await c.http.get(`/api/ordenes/${otId}`).set(c.auth(c.admin));
    expect(o.body.eventos.map((e: { nota: string }) => e.nota).join(' | ')).toMatch(/Solicitud de compra automática SC-\d{6}: ROD-1 × 2/);
  });
});

describe('COM-03/04/05 · Aprobación', () => {
  it('el técnico ve la solicitud de su OT pero no puede aprobarla', async () => {
    expect((await c.http.get(`/api/compras/${scId}`).set(c.auth(tec.token))).status).toBe(200);
    expect((await c.http.post(`/api/compras/${scId}/aprobar`).set(c.auth(tec.token))).status).toBe(403);
  });

  it('el operario no tiene acceso a compras', async () => {
    expect((await c.http.get('/api/compras').set(c.auth(op.token))).status).toBe(403);
  });

  it('un autorizador que no es el vigente no puede decidir', async () => {
    const r = await c.http.post(`/api/compras/${scId}/aprobar`).set(c.auth(aut2.token));
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/vigente/);
  });

  it('al cambiar el autorizador, la pendiente pasa al nuevo', async () => {
    await c.http.put('/api/parametros/autorizador').set(c.auth(c.admin)).send({ usuarioId: aut2.id }).expect(200);
    const d = await c.http.get(`/api/compras/${scId}`).set(c.auth(aut2.token));
    expect(d.body.acciones).toMatchObject({ aprobar: true, rechazar: true });
    expect((await c.http.get(`/api/compras/${scId}`).set(c.auth(aut.token))).body.acciones.aprobar).toBe(false);
  });

  it('rechazar exige motivo', async () => {
    expect((await c.http.post(`/api/compras/${scId}/rechazar`).set(c.auth(aut2.token)).send({})).status).toBe(400);
  });

  it('el autorizador vigente aprueba con un clic y queda en bitácora', async () => {
    const r = await c.http.post(`/api/compras/${scId}/aprobar`).set(c.auth(aut2.token));
    expect(r.status).toBe(201);
    const d = await c.http.get(`/api/compras/${scId}`).set(c.auth(c.admin));
    expect(d.body).toMatchObject({ estado: 'APROBADA', decididaPor: { id: aut2.id } });
    expect(d.body.historial.map((h: { accion: string }) => h.accion)).toEqual(['COMPRA_SOLICITADA', 'COMPRA_AJUSTADA', 'COMPRA_APROBADA']);
  });

  it('no se puede aprobar dos veces', async () => {
    expect((await c.http.post(`/api/compras/${scId}/aprobar`).set(c.auth(aut2.token))).status).toBe(400);
  });

  it('COM-05 · nadie aprueba su propia solicitud', async () => {
    // Un autorizador que además pide un repuesto (por ejemplo desde una cuenta de técnico que luego fue ascendida)
    const propia = await c.http.post('/api/compras').set(c.auth(tec.token)).send({ repuestoId: rodId, cantidad: 1, justificacion: 'Repuesto de respaldo' });
    expect(propia.status).toBe(201);
    await c.http.patch(`/api/usuarios/${tec.id}`).set(c.auth(c.admin)).send({ rol: 'AUTORIZADOR', credencial: 'Ascendido2026' }).expect(200);
    await c.http.put('/api/parametros/autorizador').set(c.auth(c.admin)).send({ usuarioId: tec.id }).expect(200);
    const t = await c.login('tec', 'Ascendido2026');
    const r = await c.http.post(`/api/compras/${propia.body.id}/aprobar`).set(c.auth(t));
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/hecha por usted/);
    // Se deja todo como estaba
    await c.http.put('/api/parametros/autorizador').set(c.auth(c.admin)).send({ usuarioId: aut2.id }).expect(200);
    await c.http.post(`/api/compras/${propia.body.id}/cancelar`).set(c.auth(c.admin)).send({ motivo: 'Prueba' }).expect(201);
  });
});

describe('COM-07/08 · Compra y recepción', () => {
  it('registra proveedor y orden de compra', async () => {
    const r = await c.http.post(`/api/compras/${scId}/comprar`).set(c.auth(c.admin)).send({ proveedor: 'Rodamientos del Valle', numeroOrdenCompra: 'OC-4512', costoEstimado: 120 });
    expect(r.status).toBe(201);
    expect((await c.http.get(`/api/compras/${scId}`).set(c.auth(c.admin))).body).toMatchObject({ estado: 'COMPRADA', proveedor: 'Rodamientos del Valle', numeroOrdenCompra: 'OC-4512' });
  });

  it('al recibir entra al inventario con el costo real y avisa en la OT', async () => {
    await c.http.post(`/api/ordenes/${otId}/esperar-repuesto`).set(c.auth(c.admin)).send({ nota: 'Esperando rodamientos' }).expect(201);
    const r = await c.http.post(`/api/compras/${scId}/recibir`).set(c.auth(c.admin)).send({ cantidadRecibida: 3, costoUnitario: 120, factura: 'FV-998' });
    expect(r.status).toBe(201);
    expect(r.body.stockResultante).toBe(4);

    const rep = await c.http.get(`/api/repuestos/${rodId}`).set(c.auth(c.admin));
    expect(rep.body.costoPromedio).toBe(115); // (1×100 + 3×120) / 4
    const k = await c.http.get(`/api/repuestos/${rodId}/kardex`).set(c.auth(c.admin));
    expect(k.body.movimientos.at(-1)).toMatchObject({ tipo: 'ENTRADA_COMPRA', cantidad: 3, referencia: expect.stringMatching(/^SC-/) });

    const o = await c.http.get(`/api/ordenes/${otId}`).set(c.auth(c.admin));
    expect(o.body.eventos.at(-1).nota).toMatch(/Llegó el repuesto .* ya puede reanudarse/);
    expect(o.body.repuestos[0]).toMatchObject({ faltante: 0 });
  });

  it('una solicitud recibida ya no se puede cancelar ni recibir de nuevo', async () => {
    expect((await c.http.post(`/api/compras/${scId}/recibir`).set(c.auth(c.admin)).send({ cantidadRecibida: 1, costoUnitario: 1 })).status).toBe(400);
    expect((await c.http.post(`/api/compras/${scId}/cancelar`).set(c.auth(c.admin)).send({ motivo: 'x x x' })).status).toBe(400);
  });
});

describe('COM-02/06 · Manual y rechazo', () => {
  it('el rechazo exige motivo, queda en la OT y la OT conserva su estado', async () => {
    const s = await c.http.post('/api/compras').set(c.auth(c.admin)).send({ repuestoId: rodId, cantidad: 5, justificacion: 'Stock de seguridad', ordenId: otId });
    expect(s.body).toMatchObject({ origen: 'MANUAL', estado: 'PENDIENTE' });
    const estadoAntes = (await c.http.get(`/api/ordenes/${otId}`).set(c.auth(c.admin))).body.estado;
    await c.http.post(`/api/compras/${s.body.id}/rechazar`).set(c.auth(aut2.token)).send({ motivo: 'Hay suficiente stock' }).expect(201);
    const o = await c.http.get(`/api/ordenes/${otId}`).set(c.auth(c.admin));
    expect(o.body.estado).toBe(estadoAntes);
    expect(o.body.eventos.at(-1).nota).toMatch(/rechazada: Hay suficiente stock/);
    const d = await c.http.get(`/api/compras/${s.body.id}`).set(c.auth(c.admin));
    expect(d.body).toMatchObject({ estado: 'RECHAZADA', motivoRechazo: 'Hay suficiente stock' });
  });

  it('el resumen cuenta las pendientes', async () => {
    await c.http.post('/api/compras').set(c.auth(c.admin)).send({ repuestoId: rodId, cantidad: 1, justificacion: 'Repuesto de respaldo' });
    const r = await c.http.get('/api/compras/resumen').set(c.auth(aut2.token));
    expect(r.body.pendientes).toBe(1);
  });
});
