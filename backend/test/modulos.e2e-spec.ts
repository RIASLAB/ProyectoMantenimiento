/** D-40: módulos de inventario y compras que se pueden apagar mientras la planta no los usa. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { bootstrap, VERIF_OK } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
type U = { id: string; token: string };
let c: Ctx;
let tec: U;
let op: U;
let activoId: string;
let rodId: string;

const modulos = (inventario: boolean, compras: boolean) =>
  c.http.put('/api/parametros/modulos').set(c.auth(c.admin)).send({ inventario, compras });

beforeAll(async () => {
  c = await bootstrap();
  tec = await c.usuario('tec', 'TECNICO', '5821');
  op = await c.usuario('op1', 'OPERARIO', '4826');
  activoId = (await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'TER-1', nombre: 'Termoformadora', area: 'Empaque' })).body.id;
  rodId = (await c.http.post('/api/repuestos').set(c.auth(c.admin)).send({ codigo: 'ROD-1', descripcion: 'Rodamiento', unidad: 'UND' })).body.id;
});

afterAll(async () => {
  await c?.app.close();
});

describe('Consulta y cambio de módulos', () => {
  it('una planta nueva arranca con inventario y compras apagados (migración)', async () => {
    // El bootstrap de pruebas los enciende; aquí se revisa el valor que deja la migración en una base nueva.
    const [fila] = await c.app.get(DataSource).query(`SELECT valor FROM parametros WHERE clave = 'modulos_activos'`);
    expect(fila).toBeTruthy();
    const sql = readFileSync(join(__dirname, '../src/database/migrations/1794300000000-ModulosActivos.ts'), 'utf8');
    expect(sql).toContain(`'{"inventario":false,"compras":false}'`);
  });

  it('cualquier usuario consulta los módulos; solo el administrador los cambia', async () => {
    expect((await c.http.get('/api/parametros/modulos').set(c.auth(op.token))).body).toEqual({ inventario: true, compras: true });
    expect((await c.http.put('/api/parametros/modulos').set(c.auth(tec.token)).send({ inventario: false, compras: false })).status).toBe(403);
  });

  it('compras no se puede encender sin inventario', async () => {
    const r = await modulos(false, true);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/inventario/);
  });
});

describe('D-41 · Administrador principal', () => {
  let aux: U;
  beforeAll(async () => { aux = await c.usuario('aux', 'ADMIN', 'Auxiliar2026'); });

  it('la sesión dice quién es el principal', async () => {
    expect((await c.http.get('/api/auth/yo').set(c.auth(c.admin))).body.principal).toBe(true);
    expect((await c.http.get('/api/auth/yo').set(c.auth(aux.token))).body.principal).toBe(false);
  });

  it('otro administrador ve los módulos pero no los cambia', async () => {
    expect((await c.http.get('/api/parametros/modulos').set(c.auth(aux.token))).status).toBe(200);
    const r = await c.http.put('/api/parametros/modulos').set(c.auth(aux.token)).send({ inventario: false, compras: false });
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Solo el administrador principal puede encender o apagar módulos.');
  });

  it('otro administrador no puede modificar la cuenta del principal', async () => {
    const yo = (await c.http.get('/api/auth/yo').set(c.auth(c.admin))).body.id;
    for (const cambio of [{ credencial: 'Robada2026x' }, { activo: false }, { rol: 'AUTORIZADOR', credencial: 'Otra2026xx' }, { nombre: 'Otro' }]) {
      const r = await c.http.patch(`/api/usuarios/${yo}`).set(c.auth(aux.token)).send(cambio);
      expect(r.status).toBe(403);
    }
    // El principal sí modifica a los demás administradores.
    expect((await c.http.patch(`/api/usuarios/${aux.id}`).set(c.auth(c.admin)).send({ nombre: 'Auxiliar administrativa' })).status).toBe(200);
  });
});

describe('Compras apagado', () => {
  beforeAll(async () => { await modulos(true, false).expect(200); });

  it('un plan con faltantes ya no crea solicitudes de compra automáticas', async () => {
    const r = await c.http.post('/api/planes').set(c.auth(c.admin)).send({
      activoId, nombre: 'Rodamientos', frecuenciaValor: 3, frecuenciaUnidad: 'MESES', primeraFecha: '2030-01-15',
      repuestos: [{ repuestoId: rodId, cantidad: 3 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.primeraOrden.solicitudesCreadas ?? []).toHaveLength(0);
    // Los repuestos sí quedan planificados en la orden (el inventario sigue encendido).
    const o = await c.http.get(`/api/ordenes/${r.body.primeraOrden.id}`).set(c.auth(c.admin));
    expect(o.body.repuestos).toHaveLength(1);
  });

  it('no se pueden crear solicitudes a mano', async () => {
    const r = await c.http.post('/api/compras').set(c.auth(c.admin)).send({ repuestoId: rodId, cantidad: 2 });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('El módulo de Compras está apagado. El administrador principal lo puede encender en Ajustes → Módulos.');
  });
});

describe('Inventario apagado', () => {
  let otId: string;
  beforeAll(async () => { await modulos(false, false).expect(200); });

  it('al apagar inventario, compras también queda apagado', async () => {
    expect((await c.http.get('/api/parametros/modulos').set(c.auth(c.admin))).body).toEqual({ inventario: false, compras: false });
  });

  it('no se crean repuestos, movimientos ni listas de materiales', async () => {
    const msg = /módulo de Inventario.*apagado/;
    const r1 = await c.http.post('/api/repuestos').set(c.auth(c.admin)).send({ codigo: 'COR-1', descripcion: 'Correa', unidad: 'UND' });
    expect(r1.status).toBe(400);
    expect(r1.body.message).toMatch(msg);
    const r2 = await c.http.post('/api/inventario/movimientos').set(c.auth(c.admin)).send({ repuestoId: rodId, tipo: 'ENTRADA_COMPRA', cantidad: 1, costoUnitario: 100 });
    expect(r2.status).toBe(400);
    const r3 = await c.http.put(`/api/activos/${activoId}/materiales`).set(c.auth(c.admin)).send({ materiales: [{ repuestoId: rodId, cantidad: 1 }] });
    expect(r3.status).toBe(400);
    // Consultar lo que ya existe sí se puede.
    expect((await c.http.get('/api/repuestos').set(c.auth(c.admin))).status).toBe(200);
  });

  it('un plan con repuestos se rechaza; sin repuestos funciona igual', async () => {
    const base = { activoId, nombre: 'Lubricación', frecuenciaValor: 1, frecuenciaUnidad: 'MESES', primeraFecha: '2030-02-01' };
    expect((await c.http.post('/api/planes').set(c.auth(c.admin)).send({ ...base, repuestos: [{ repuestoId: rodId, cantidad: 1 }] })).status).toBe(400);
    const r = await c.http.post('/api/planes').set(c.auth(c.admin)).send({ ...base, repuestos: [] });
    expect(r.status).toBe(201);
  });

  it('las fallas se reportan y las órdenes se cierran sin repuestos', async () => {
    const r = await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId, descripcion: 'Se atasca la película', maquinaParada: false });
    expect(r.status).toBe(201);
    otId = r.body.id;
    await c.http.post(`/api/ordenes/${otId}/asignar`).set(c.auth(c.admin)).send({ tecnicoId: tec.id }).expect(201);
    await c.http.post(`/api/ordenes/${otId}/iniciar`).set(c.auth(tec.token)).expect(201);
    const conRepuestos = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec.token))
      .send({ ...VERIF_OK, trabajoRealizado: 'Ajuste de guías', repuestosUsados: [{ repuestoId: rodId, cantidad: 1 }], manoObra: [] });
    expect(conRepuestos.status).toBe(400);
    const cierre = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec.token))
      .send({ ...VERIF_OK, trabajoRealizado: 'Ajuste de guías', repuestosUsados: [], manoObra: [{ tecnicoId: tec.id, horas: 1 }] });
    expect(cierre.status).toBe(201);
    expect(cierre.body).toMatchObject({ ok: true, costoRepuestos: 0 });
  });

  it('el cambio de módulos queda en la bitácora', async () => {
    const b = await c.http.get('/api/bitacora?entidad=parametro').set(c.auth(c.admin));
    const cambio = b.body.items.find((a: { accion: string }) => a.accion === 'MODULOS_CAMBIADOS');
    expect(cambio.detalle.Inventario).toEqual({ antes: 'Encendido', despues: 'Apagado' });
  });

  it('al volver a encenderlos todo funciona de nuevo', async () => {
    await modulos(true, true).expect(200);
    expect((await c.http.post('/api/repuestos').set(c.auth(c.admin)).send({ codigo: 'COR-1', descripcion: 'Correa', unidad: 'UND' })).status).toBe(201);
  });
});
