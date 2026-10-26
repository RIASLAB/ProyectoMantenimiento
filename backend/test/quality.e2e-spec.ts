/** Calidad HACCP/BPM (CAL-01 a CAL-07). */
import { DataSource } from 'typeorm';
import { bootstrap } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let op: { id: string; token: string };
let activoId: string;
let puntoId: string;
let plantillaId: string;
let tempOkId: string;

beforeAll(async () => {
  c = await bootstrap();
  op = await c.usuario('op1', 'OPERARIO', '4826');
  activoId = (await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'CF-1', nombre: 'Cuarto frío', area: 'Refrigeración' })).body.id;
});

afterAll(async () => {
  await c?.app.close();
});

describe('CAL-02 · Puntos de control y límites', () => {
  it('solo el administrador configura límites', async () => {
    const body = { activoId, nombre: 'Temperatura de cámara', minimo: 0, maximo: 4, frecuenciaHoras: 4 };
    expect((await c.http.post('/api/calidad/puntos').set(c.auth(op.token)).send(body)).status).toBe(403);
    const r = await c.http.post('/api/calidad/puntos').set(c.auth(c.admin)).send(body);
    expect(r.status).toBe(201);
    puntoId = r.body.id;
  });

  it('rechaza un mínimo mayor que el máximo', async () => {
    const r = await c.http.post('/api/calidad/puntos').set(c.auth(c.admin)).send({ activoId, nombre: 'Malo', minimo: 10, maximo: 2 });
    expect(r.status).toBe(400);
  });

  it('CAL-07 · un punto sin registros aparece atrasado', async () => {
    const r = await c.http.get('/api/calidad/puntos').set(c.auth(op.token));
    expect(r.body[0]).toMatchObject({ id: puntoId, atrasado: true, ultimo: null });
  });
});

describe('CAL-01/03 · Registro de temperaturas', () => {
  it('el operario registra una temperatura en rango', async () => {
    const r = await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId, valor: 2.5 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ valor: 2.5, fueraDeRango: false, limiteMinimo: 0, limiteMaximo: 4, usuarioId: op.id });
    expect(r.body.registradoEn).toBeTruthy();
    expect(r.body.creadoEn).toBeTruthy();
    tempOkId = r.body.id;
  });

  it('fuera de rango exige acción correctiva', async () => {
    const sin = await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId, valor: 7.8 });
    expect(sin.status).toBe(400);
    expect(sin.body.message).toMatch(/fuera del rango \(0 a 4 °C\)/);
    const con = await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId, valor: 7.8, accionCorrectiva: 'Se cerró la puerta y se avisó a mantenimiento' });
    expect(con.status).toBe(201);
    expect(con.body.fueraDeRango).toBe(true);
  });

  it('valida que sea numérico y que la hora no esté en el futuro', async () => {
    expect((await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId, valor: 'frío' })).status).toBe(400);
    const futuro = new Date(Date.now() + 3_600_000).toISOString();
    expect((await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId, valor: 2, registradoEn: futuro })).status).toBe(400);
  });

  it('OFF-02 · reenviar con el mismo clientId no duplica', async () => {
    const body = { puntoId, valor: 3, clientId: '6b1f7a2e-1c11-4d9a-8e55-222222222222', registradoEn: new Date(Date.now() - 600_000).toISOString() };
    const a = await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send(body);
    const b = await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send(body);
    expect(a.body.duplicado).toBe(false);
    expect(b.body).toMatchObject({ duplicado: true, id: a.body.id });
  });

  it('la desviación queda en el resumen y en la bitácora; el punto deja de estar atrasado', async () => {
    const r = await c.http.get('/api/calidad/resumen').set(c.auth(op.token));
    expect(r.body).toMatchObject({ temperaturas24h: 3, desviaciones24h: 1, puntosAtrasados: 0 });
    const b = await c.http.get('/api/bitacora?entidad=calidad').set(c.auth(c.admin));
    expect(b.body.items.map((i: { accion: string }) => i.accion)).toContain('TEMPERATURA_FUERA_DE_RANGO');
  });

  it('cambiar un límite no altera la evaluación de registros anteriores', async () => {
    await c.http.patch(`/api/calidad/puntos/${puntoId}`).set(c.auth(c.admin)).send({ maximo: 10 }).expect(200);
    const l = await c.http.get('/api/calidad/temperaturas?soloDesviaciones=true').set(c.auth(c.admin));
    expect(l.body).toHaveLength(1);
    expect(l.body[0]).toMatchObject({ valor: 7.8, limiteMaximo: 4, fueraDeRango: true });
    const b = await c.http.get('/api/bitacora?entidad=calidad').set(c.auth(c.admin));
    expect(b.body.items[0]).toMatchObject({ accion: 'PUNTO_CONTROL_ACTUALIZADO', detalle: { maximo: { antes: 4, despues: 10 } } });
  });
});

describe('CAL-05 · Registros inalterables', () => {
  it('no se pueden editar ni borrar en la base de datos', async () => {
    const ds = c.app.get(DataSource);
    await expect(ds.query('UPDATE registros_temperatura SET valor = 1')).rejects.toThrow(/solo inserción/);
    await expect(ds.query('DELETE FROM registros_temperatura')).rejects.toThrow(/solo inserción/);
  });

  it('se corrigen con una anulación con motivo (solo administrador, una sola vez)', async () => {
    expect((await c.http.post('/api/calidad/anulaciones').set(c.auth(op.token)).send({ tipo: 'TEMPERATURA', registroId: tempOkId, motivo: 'Error de digitación' })).status).toBe(403);
    expect((await c.http.post('/api/calidad/anulaciones').set(c.auth(c.admin)).send({ tipo: 'TEMPERATURA', registroId: tempOkId, motivo: 'Error de digitación' })).status).toBe(201);
    expect((await c.http.post('/api/calidad/anulaciones').set(c.auth(c.admin)).send({ tipo: 'TEMPERATURA', registroId: tempOkId, motivo: 'Otra vez' })).status).toBe(409);
    const l = await c.http.get('/api/calidad/temperaturas').set(c.auth(c.admin));
    const anulado = l.body.find((t: { id: string }) => t.id === tempOkId);
    expect(anulado.valor).toBe(2.5); // el registro original se conserva
    expect(anulado.anulacion).toMatchObject({ motivo: 'Error de digitación', usuario: { nombre: 'Admin Pruebas' } });
  });
});

describe('CAL-04 · Checklists', () => {
  it('el administrador crea una plantilla con preguntas Sí/No, numéricas y de texto', async () => {
    const r = await c.http.post('/api/calidad/plantillas').set(c.auth(c.admin)).send({
      nombre: 'Pre-operacional molino', area: 'Proceso', items: [
        { texto: '¿Equipo limpio y desinfectado?', tipo: 'SI_NO', obligatorio: true },
        { texto: '¿Hay restos de producto?', tipo: 'SI_NO', obligatorio: true, esperado: 'NO' },
        { texto: 'Concentración de desinfectante (ppm)', tipo: 'NUMERO', obligatorio: true, minimo: 100, maximo: 200 },
        { texto: 'Observación del turno', tipo: 'TEXTO', obligatorio: false },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.items).toHaveLength(4);
    expect(r.body.items[0]).toMatchObject({ esperado: 'SI' });
    plantillaId = r.body.id;
  });

  const responder = (items: Array<{ id: string }>, valores: Array<string | number | null>) => items.map((i, k) => ({ itemId: i.id, valor: valores[k] }));

  it('un checklist conforme se guarda sin acción correctiva', async () => {
    const p = (await c.http.get(`/api/calidad/plantillas/${plantillaId}`).set(c.auth(op.token))).body;
    const r = await c.http.post('/api/calidad/checklists').set(c.auth(op.token)).send({ plantillaId, respuestas: responder(p.items, ['SI', 'NO', 150, null]) });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ noConformes: 0, plantillaNombre: 'Pre-operacional molino' });
    expect(r.body.respuestas[0]).toMatchObject({ texto: '¿Equipo limpio y desinfectado?', valor: 'SI', conforme: true });
  });

  it('falta una obligatoria → error con el texto de la pregunta', async () => {
    const p = (await c.http.get(`/api/calidad/plantillas/${plantillaId}`).set(c.auth(op.token))).body;
    const r = await c.http.post('/api/calidad/checklists').set(c.auth(op.token)).send({ plantillaId, respuestas: responder(p.items, ['SI', null, 150, null]) });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/restos de producto/);
  });

  it('las no conformidades se marcan y exigen acción correctiva', async () => {
    const p = (await c.http.get(`/api/calidad/plantillas/${plantillaId}`).set(c.auth(op.token))).body;
    const resp = responder(p.items, ['NO', 'SI', 50, 'Turno noche']);
    const sin = await c.http.post('/api/calidad/checklists').set(c.auth(op.token)).send({ plantillaId, respuestas: resp });
    expect(sin.status).toBe(400);
    expect(sin.body.message).toMatch(/3 puntos no conformes/);
    const con = await c.http.post('/api/calidad/checklists').set(c.auth(op.token)).send({ plantillaId, respuestas: resp, accionCorrectiva: 'Se volvió a lavar y se ajustó la dilución' });
    expect(con.status).toBe(201);
    expect(con.body.noConformes).toBe(3);
    expect(con.body.respuestas.map((x: { conforme: boolean }) => x.conforme)).toEqual([false, false, false, true]);
  });

  it('cambiar la plantilla no altera los checklists ya llenados', async () => {
    const p = (await c.http.get(`/api/calidad/plantillas/${plantillaId}`).set(c.auth(c.admin))).body;
    await c.http.patch(`/api/calidad/plantillas/${plantillaId}`).set(c.auth(c.admin)).send({ items: [{ ...p.items[0], texto: '¿Superficies limpias?' }] }).expect(200);
    const l = await c.http.get('/api/calidad/checklists').set(c.auth(c.admin));
    expect(l.body.every((x: { respuestas: unknown[] }) => x.respuestas.length === 4)).toBe(true);
    expect(l.body[0].respuestas[0].texto).toBe('¿Equipo limpio y desinfectado?');
  });

  it('CAL-06 · exporta checklists y temperaturas a CSV para auditoría', async () => {
    const t = await c.http.get('/api/calidad/exportar/temperaturas').set(c.auth(c.admin));
    expect(t.status).toBe(200);
    expect(t.text).toContain('Fecha lectura;Recibido en servidor;Máquina;Punto de control;Valor °C');
    expect(t.text).toContain('7,8;0;4;Sí;Se cerró la puerta');
    expect(t.text).toMatch(/2,5;0;4;No;;Usuario op1;Sí;Error de digitación/);
    const k = await c.http.get('/api/calidad/exportar/checklists').set(c.auth(c.admin));
    expect(k.text).toContain('[NC] ¿Equipo limpio y desinfectado?: NO');
    expect((await c.http.get('/api/calidad/exportar/checklists').set(c.auth(op.token))).status).toBe(403);
  });
});
