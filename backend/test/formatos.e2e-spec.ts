/** Formatos de mantenimiento de la planta: preoperacionales, cierre de la OT, hoja de vida, temperaturas, iluminación y carga. */
import { DataSource } from 'typeorm';
import { bootstrap, VERIF_OK } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let op: { id: string; token: string };
let tec: { id: string; token: string };
let aut: { id: string; token: string };
let maquinaId: string;

beforeAll(async () => {
  c = await bootstrap();
  op = await c.usuario('op1', 'OPERARIO', '4826');
  tec = await c.usuario('tec1', 'TECNICO', '5931');
  aut = await c.usuario('aut1', 'AUTORIZADOR', 'Autoriza2026');
  maquinaId = (await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'CUB-01', nombre: 'Cubicadora', area: 'Planta Desposte' })).body.id;
});

afterAll(async () => {
  await c?.app.close();
});

describe('Preoperacionales: B / R / M / No tiene / NA, secciones y observación por ítem', () => {
  let plantillaId: string;
  let ids: Record<string, string>;

  it('crea una plantilla con el control documental del formato', async () => {
    const r = await c.http.post('/api/calidad/plantillas').set(c.auth(c.admin)).send({
      nombre: 'Preoperacional cubicadora', area: 'Planta Desposte', codigo: 'AC-PMT-FR072', version: '3',
      fechaElaboracion: '2020-11-10', fechaActualizacion: '2024-11-15', recomendacion: 'No mojar la unidad de mando.',
      items: [
        { texto: 'Motor y conexiones', tipo: 'SECCION', obligatorio: true },
        { texto: 'Limpieza general del equipo', tipo: 'ESCALA', obligatorio: true },
        { texto: 'Cuchillas y portacuchillas', tipo: 'ESCALA', obligatorio: true },
        { texto: 'Extintor cerca del equipo', tipo: 'ESCALA', obligatorio: true },
        { texto: '¿Tiene polo a tierra?', tipo: 'SI_NO', obligatorio: true, etiqueta: 'BUENO_MALO', permiteNA: true },
        { texto: '¿Tiene parada de emergencia?', tipo: 'SI_NO', obligatorio: true },
        { texto: 'Horómetro', tipo: 'NUMERO', obligatorio: false },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ codigo: 'AC-PMT-FR072', version: '3', fechaElaboracion: '2020-11-10', recomendacion: 'No mojar la unidad de mando.' });
    // Un título de sección nunca es obligatorio; las opciones del Sí/No quedan guardadas.
    expect(r.body.items[0]).toMatchObject({ tipo: 'SECCION', obligatorio: false });
    expect(r.body.items[4]).toMatchObject({ etiqueta: 'BUENO_MALO', permiteNA: true, esperado: 'SI' });
    expect(r.body.items[5]).toMatchObject({ etiqueta: 'SI_NO', permiteNA: false });
    plantillaId = r.body.id;
    const [, limpieza, cuchillas, extintor, tierra, parada] = r.body.items.map((i: { id: string }) => i.id);
    ids = { limpieza, cuchillas, extintor, tierra, parada };
  });

  const respuestas = (v: Record<string, string>, obs: Record<string, string> = {}) =>
    Object.entries(v).map(([k, valor]) => ({ itemId: ids[k], valor, ...(obs[k] ? { observacion: obs[k] } : {}) }));

  it('"Regular" exige escribir qué está regular', async () => {
    const base = { limpieza: 'B', cuchillas: 'R', extintor: 'NA', tierra: 'SI', parada: 'SI' };
    const sin = await c.http.post('/api/calidad/checklists').set(c.auth(op.token)).send({ plantillaId, activoId: maquinaId, respuestas: respuestas(base) });
    expect(sin.status).toBe(400);
    expect(sin.body.message).toMatch(/Regular: Cuchillas/);
    const con = await c.http.post('/api/calidad/checklists').set(c.auth(op.token))
      .send({ plantillaId, activoId: maquinaId, respuestas: respuestas(base, { cuchillas: 'Afilado desparejo' }) });
    expect(con.status).toBe(201);
    expect(con.body.noConformes).toBe(0);
    const cuchillas = con.body.respuestas.find((x: { itemId: string }) => x.itemId === ids.cuchillas);
    expect(cuchillas).toMatchObject({ valor: 'R', conforme: true, observacion: 'Afilado desparejo' });
    // La sección se copia para conservar la estructura del formato.
    expect(con.body.respuestas[0]).toMatchObject({ tipo: 'SECCION', valor: null });
  });

  it('Malo y No tiene son no conformes y piden acción correctiva; NA en Sí/No solo si la pregunta lo admite', async () => {
    const malo = { limpieza: 'M', cuchillas: 'B', extintor: 'NT', tierra: 'NA', parada: 'SI' };
    const sin = await c.http.post('/api/calidad/checklists').set(c.auth(op.token)).send({ plantillaId, respuestas: respuestas(malo) });
    expect(sin.status).toBe(400);
    expect(sin.body.message).toMatch(/2 puntos no conformes/);
    const con = await c.http.post('/api/calidad/checklists').set(c.auth(op.token)).send({ plantillaId, respuestas: respuestas(malo), accionCorrectiva: 'Se llamó a mantenimiento y se trajo el extintor' });
    expect(con.status).toBe(201);
    expect(con.body.noConformes).toBe(2);

    const naNoAdmitido = await c.http.post('/api/calidad/checklists').set(c.auth(op.token))
      .send({ plantillaId, respuestas: respuestas({ limpieza: 'B', cuchillas: 'B', extintor: 'B', tierra: 'SI', parada: 'NA' }) });
    expect(naNoAdmitido.status).toBe(400);
    const valorInvalido = await c.http.post('/api/calidad/checklists').set(c.auth(op.token))
      .send({ plantillaId, respuestas: respuestas({ limpieza: 'X', cuchillas: 'B', extintor: 'B', tierra: 'SI', parada: 'SI' }) });
    expect(valorInvalido.status).toBe(400);
    expect(valorInvalido.body.message).toMatch(/Califique B, R, M/);
  });

  it('la semana del preoperacional se consulta por plantilla y máquina', async () => {
    const r = await c.http.get(`/api/calidad/checklists?plantillaId=${plantillaId}&activoId=${maquinaId}`).set(c.auth(op.token));
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });
});

describe('Orden de trabajo: verificaciones de entrega del formato AC-PMT FR03', () => {
  let otId: string;

  beforeAll(async () => {
    const o = await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId: maquinaId, descripcion: 'La cuchilla vibra', maquinaParada: false });
    otId = o.body.id;
    await c.http.post(`/api/ordenes/${otId}/asignar`).set(c.auth(c.admin)).send({ tecnicoId: tec.id }).expect(201);
    await c.http.post(`/api/ordenes/${otId}/iniciar`).set(c.auth(tec.token)).expect(201);
  });

  const cierre = { trabajoRealizado: 'Se ajustó la cuchilla y se apretaron los tornillos', repuestosUsados: [], manoObra: [] };

  it('no se puede cerrar sin responder las verificaciones', async () => {
    const r = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec.token)).send(cierre);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/verificaciones de entrega/);
    const incompleta = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec.token))
      .send({ ...cierre, verificaciones: VERIF_OK.verificaciones.slice(0, 3) });
    expect(incompleta.status).toBe(400);
    expect(incompleta.body.message).toMatch(/Falta la verificación/);
  });

  it('si algo no cumple hay que explicarlo, y queda en la orden y en la bitácora', async () => {
    const verificaciones = VERIF_OK.verificaciones.map((v) => (v.id === 'limpieza' ? { ...v, cumple: false } : v));
    const sinObs = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec.token)).send({ ...cierre, verificaciones });
    expect(sinObs.status).toBe(400);
    expect(sinObs.body.message).toMatch(/explique en observaciones/);
    const ok = await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec.token))
      .send({ ...cierre, verificaciones, observaciones: 'Limpieza no disponible; se avisó al líder de área' });
    expect(ok.status).toBe(201);

    const o = await c.http.get(`/api/ordenes/${otId}`).set(c.auth(c.admin));
    expect(o.body.observaciones).toBe('Limpieza no disponible; se avisó al líder de área');
    expect(o.body.verificaciones).toHaveLength(4);
    expect(o.body.verificaciones.find((v: { id: string }) => v.id === 'limpieza')).toMatchObject({ cumple: false, texto: expect.stringMatching(/limpieza y desinfección/) });
    const b = await c.http.get('/api/bitacora?accion=OT_CERRADA_CON_NO_CUMPLE').set(c.auth(c.admin));
    expect(JSON.stringify(b.body)).toMatch(/OT_CERRADA_CON_NO_CUMPLE/);
  });
});

describe('Hoja de vida e instalaciones (mantenimiento locativo)', () => {
  it('guarda los datos técnicos de la hoja de vida', async () => {
    const r = await c.http.patch(`/api/activos/${maquinaId}`).set(c.auth(c.admin))
      .send({ voltaje: '220 V', amperaje: '12 A', capacidad: '300 kg/h', peso: '180 kg', ubicacionManual: 'Oficina de mantenimiento' });
    expect(r.status).toBe(200);
    const a = await c.http.get(`/api/activos/${maquinaId}`).set(c.auth(op.token));
    expect(a.body).toMatchObject({ clase: 'EQUIPO', voltaje: '220 V', amperaje: '12 A', capacidad: '300 kg/h', peso: '180 kg', ubicacionManual: 'Oficina de mantenimiento' });
  });

  it('una instalación recibe reportes, se filtra aparte y no cuenta como equipo por área', async () => {
    const r = await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'INS-01', nombre: 'Sala de desposte', area: 'Planta Desposte', clase: 'INSTALACION' });
    expect(r.status).toBe(201);
    const falla = await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId: r.body.id, descripcion: 'Baldosa rota junto al desagüe', maquinaParada: false });
    expect(falla.status).toBe(201);
    const inst = await c.http.get('/api/activos?clase=INSTALACION').set(c.auth(op.token));
    expect(inst.body.map((a: { codigo: string }) => a.codigo)).toEqual(['INS-01']);
    const eq = await c.http.get('/api/activos?clase=EQUIPO').set(c.auth(op.token));
    expect(eq.body.map((a: { codigo: string }) => a.codigo)).toEqual(['CUB-01']);
    const resumen = await c.http.get('/api/tipos-equipo/resumen').set(c.auth(c.admin));
    expect(resumen.body.total).toBe(1);
  });
});

describe('Planilla diaria de temperaturas y su verificación', () => {
  const area = 'Planta Pollo';
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  let puntoA: string;

  beforeAll(async () => {
    for (const [codigo, nombre, minimo, maximo] of [['CF-T1', 'Refrigeración', -4, 4], ['CF-T2', 'Congelación', -18, -10]] as const) {
      const a = await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo, nombre, area, clase: 'INSTALACION' });
      const p = await c.http.post('/api/calidad/puntos').set(c.auth(c.admin)).send({ activoId: a.body.id, nombre: 'Temperatura del cuarto', minimo, maximo, frecuenciaHoras: 3 });
      if (codigo === 'CF-T1') puntoA = p.body.id;
    }
  });

  it('sin lecturas no se puede verificar', async () => {
    const r = await c.http.post('/api/calidad/planilla/verificar').set(c.auth(c.admin)).send({ fecha: hoy, area });
    expect(r.status).toBe(400);
  });

  it('la planilla trae los puntos del área, las lecturas del día con su franja de 3 horas y quién las registró', async () => {
    await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId: puntoA, valor: 2 }).expect(201);
    const areas = await c.http.get('/api/calidad/planilla/areas').set(c.auth(op.token));
    expect(areas.body).toContain(area);
    const r = await c.http.get(`/api/calidad/planilla?fecha=${hoy}&area=${encodeURIComponent('planta pollo')}`).set(c.auth(op.token));
    expect(r.status).toBe(200);
    expect(r.body.puntos.map((p: { activo: { codigo: string } }) => p.activo.codigo)).toEqual(['CF-T1', 'CF-T2']);
    expect(r.body.lecturas).toHaveLength(1);
    expect(r.body.lecturas[0].franja % 3).toBe(0);
    expect(r.body.realizadoPor).toEqual(['Usuario op1']);
    expect(r.body.verificacion).toBeNull();
    expect(r.body.formato).toMatchObject({ codigo: 'AC-PMT-FR01' });
  });

  it('verifica el jefe (administrador o autorizador), una sola vez, y el registro no se puede modificar', async () => {
    expect((await c.http.post('/api/calidad/planilla/verificar').set(c.auth(tec.token)).send({ fecha: hoy, area })).status).toBe(403);
    const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect((await c.http.post('/api/calidad/planilla/verificar').set(c.auth(aut.token)).send({ fecha: manana, area })).status).toBe(400);
    const r = await c.http.post('/api/calidad/planilla/verificar').set(c.auth(aut.token)).send({ fecha: hoy, area, observaciones: 'Todo en rango' });
    expect(r.status).toBe(201);
    expect((await c.http.post('/api/calidad/planilla/verificar').set(c.auth(c.admin)).send({ fecha: hoy, area: 'PLANTA POLLO' })).status).toBe(409);
    const p = await c.http.get(`/api/calidad/planilla?fecha=${hoy}&area=${encodeURIComponent(area)}`).set(c.auth(op.token));
    expect(p.body.verificacion).toMatchObject({ usuario: 'Usuario aut1', observaciones: 'Todo en rango' });

    const ds = new DataSource({ type: 'postgres', url: process.env.TEST_DATABASE_URL });
    await ds.initialize();
    await expect(ds.query(`UPDATE verificaciones_temperatura SET observaciones = 'x'`)).rejects.toThrow(/solo inserción/);
    await ds.destroy();
  });
});

describe('Medición de iluminación', () => {
  let recintoPlanta: string;
  let recintoOficina: string;
  let puntos: string[];
  let medicionId: string;

  it('el administrador configura los tipos de recinto y los puntos', async () => {
    const malo = await c.http.post('/api/iluminacion/recintos').set(c.auth(c.admin)).send({ nombre: 'Mal ordenado', minimo: 500, promedio: 300, maximo: 600 });
    expect(malo.status).toBe(400);
    expect((await c.http.post('/api/iluminacion/recintos').set(c.auth(tec.token)).send({ nombre: 'X recinto', minimo: 1, promedio: 2, maximo: 3 })).status).toBe(403);
    recintoPlanta = (await c.http.post('/api/iluminacion/recintos').set(c.auth(c.admin)).send({ nombre: 'Industria alimenticia / Áreas generales', minimo: 200, promedio: 300, maximo: 600 })).body.id;
    recintoOficina = (await c.http.post('/api/iluminacion/recintos').set(c.auth(c.admin)).send({ nombre: 'Oficinas', minimo: 300, promedio: 500, maximo: 750 })).body.id;
    puntos = [];
    for (const [nombre, recintoId] of [['Sala de desposte', recintoPlanta], ['Oficina de despachos', recintoOficina]]) {
      const r = await c.http.post('/api/iluminacion/puntos').set(c.auth(c.admin)).send({ nombre, recintoId });
      expect(r.status).toBe(201);
      puntos.push(r.body.id);
    }
    const l = await c.http.get('/api/iluminacion/puntos').set(c.auth(op.token));
    expect(l.body.map((p: { nombre: string; orden: number }) => [p.nombre, p.orden])).toEqual([['Sala de desposte', 1], ['Oficina de despachos', 2]]);
  });

  const base = { fecha: '2026-10-20', empresa: 'NUTRIALIMENTOS', lugar: 'Planta', evaluador: 'Juan Pérez', cargoEvaluador: 'Técnico de mantenimiento' };

  it('la media por debajo del mínimo exige plan de acción', async () => {
    const lecturas = [
      { puntoId: puntos[0], medicion1: 250, medicion2: 310, medicion3: 280.5 },
      { puntoId: puntos[1], medicion1: 280, medicion2: 290, medicion3: 300 },
    ];
    expect((await c.http.post('/api/iluminacion/mediciones').set(c.auth(op.token)).send({ ...base, lecturas })).status).toBe(403);
    const sin = await c.http.post('/api/iluminacion/mediciones').set(c.auth(tec.token)).send({ ...base, lecturas });
    expect(sin.status).toBe(400);
    expect(sin.body.message).toMatch(/Oficina de despachos: la media \(290 lux\) está por debajo del mínimo \(300 lux\)/);
    lecturas[1] = { ...lecturas[1], planAccion: 'Cambiar las lámparas por LED de 18 W' } as never;
    const ok = await c.http.post('/api/iluminacion/mediciones').set(c.auth(tec.token)).send({ ...base, lecturas });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ puntosCumplen: 1, puntosNoCumplen: 1 });
    medicionId = ok.body.id;
  });

  it('la medición guarda una copia de las referencias, la media y el encabezado del formato', async () => {
    // Cambiar la referencia después no altera la medición.
    await c.http.patch(`/api/iluminacion/recintos/${recintoPlanta}`).set(c.auth(c.admin)).send({ nombre: 'Industria alimenticia / Áreas generales', minimo: 400, promedio: 500, maximo: 700 }).expect(200);
    const r = await c.http.get(`/api/iluminacion/mediciones/${medicionId}`).set(c.auth(op.token));
    expect(r.body.lecturas[0]).toMatchObject({ puntoNombre: 'Sala de desposte', refMinimo: 200, media: 280.2, cumple: true });
    expect(r.body.lecturas[1]).toMatchObject({ media: 290, cumple: false, planAccion: 'Cambiar las lámparas por LED de 18 W' });
    expect(r.body.formato).toMatchObject({ codigo: 'AC-PMT-MI01' });
  });

  it('rechaza puntos repetidos y empresas desconocidas', async () => {
    const lecturas = [{ puntoId: puntos[0], medicion1: 300, medicion2: 300, medicion3: 300 }];
    expect((await c.http.post('/api/iluminacion/mediciones').set(c.auth(tec.token)).send({ ...base, lecturas: [...lecturas, ...lecturas] })).status).toBe(400);
    expect((await c.http.post('/api/iluminacion/mediciones').set(c.auth(tec.token)).send({ ...base, empresa: 'OTRA', lecturas })).status).toBe(400);
  });
});

describe('Control documental de los formatos', () => {
  it('todos leen los códigos; solo el administrador los cambia', async () => {
    const r = await c.http.get('/api/parametros/formatos').set(c.auth(op.token));
    expect(r.body.OT).toMatchObject({ codigo: 'AC-PMT FR03', version: '6' });
    const nuevo = { nombre: 'Orden de trabajo', codigo: 'AC-PMT FR03', version: '7', fechaElaboracion: '2018-10-29', fechaActualizacion: '2026-11-01' };
    expect((await c.http.put('/api/parametros/formatos/OT').set(c.auth(tec.token)).send(nuevo)).status).toBe(403);
    expect((await c.http.put('/api/parametros/formatos/ot%20malo').set(c.auth(c.admin)).send(nuevo)).status).toBe(400);
    const ok = await c.http.put('/api/parametros/formatos/OT').set(c.auth(c.admin)).send(nuevo);
    expect(ok.status).toBe(200);
    expect(ok.body.OT.version).toBe('7');
    expect(ok.body.HOJA_VIDA.codigo).toBe('AC-PMT-FR05');
  });

  it('la planilla de una planta usa su propio formato si existe', async () => {
    await c.http.put(`/api/parametros/formatos/${encodeURIComponent('TEMPERATURA:Planta Desposte')}`).set(c.auth(c.admin))
      .send({ nombre: 'Temperaturas desposte', codigo: 'AC-PMT-FR02', version: '17', fechaElaboracion: null, fechaActualizacion: null }).expect(200);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const r = await c.http.get(`/api/calidad/planilla?fecha=${hoy}&area=${encodeURIComponent('Planta Desposte')}`).set(c.auth(op.token));
    expect(r.body.formato).toMatchObject({ codigo: 'AC-PMT-FR02', version: '17' });
  });
});

describe('Carga de los formatos de la planta', () => {
  it('carga los formatos una vez y no duplica al repetir', async () => {
    const { cargarFormatos, rangoCuarto } = await import('../src/database/formatos/cargar');
    const ds = new DataSource((await import('../src/database/data-source')).dataSourceOptions(process.env.TEST_DATABASE_URL));
    await ds.initialize();
    try {
      const primera = await cargarFormatos(ds);
      // La cubicadora y el punto "Sala de desposte" ya existían (creados arriba): no se pisan.
      expect(primera).toMatchObject({ plantillas: 16, instalaciones: 55, puntosTemperatura: 55, recintos: 2, puntosIluminacion: 25 });
      const segunda = await cargarFormatos(ds);
      expect(segunda).toMatchObject({ plantillas: 0, instalaciones: 0, puntosTemperatura: 0, recintos: 0, puntosIluminacion: 0 });
    } finally {
      await ds.destroy();
    }
    const plantillas = await c.http.get('/api/calidad/plantillas').set(c.auth(op.token));
    const cubicadora = plantillas.body.filter((p: { nombre: string }) => p.nombre === 'Preoperacional cubicadora');
    expect(cubicadora).toHaveLength(1);
    expect(cubicadora[0].items).toHaveLength(7);
    const molino = plantillas.body.find((p: { nombre: string }) => p.nombre === 'Preoperacional molino');
    expect(molino).toMatchObject({ codigo: 'AC-PMT-FR078', version: '3', area: 'Planta Desposte' });
    expect(molino.items.every((i: { tipo: string }) => i.tipo === 'ESCALA')).toBe(true);
    const diaria = plantillas.body.find((p: { nombre: string }) => p.nombre === 'Preoperatorio diario de equipos · Planta Salsamentaria');
    expect(diaria.items[0]).toMatchObject({ tipo: 'SECCION', texto: 'Area de procesos' });
    expect(diaria.items[1]).toMatchObject({ tipo: 'SI_NO', etiqueta: 'C_NC', permiteNA: true });
    // La planilla de desposte quedó con su formato propio (ya se había configurado antes: no se pisa).
    const f = await c.http.get('/api/parametros/formatos').set(c.auth(op.token));
    expect(f.body['TEMPERATURA:Planta Desposte'].version).toBe('17');
    expect(f.body['TEMPERATURA:Planta Salsamentaria']).toMatchObject({ codigo: 'AC-PMT-FR02', version: '1' });

    expect(rangoCuarto('TUNEL DE CONGELACION #2')).toEqual({ minimo: -24, maximo: -18 });
    expect(rangoCuarto('Cuarto frizz empaque')).toEqual({ minimo: -18, maximo: -10 });
    expect(rangoCuarto('Cuarto de canal de res')).toEqual({ minimo: -5, maximo: 4 });
    expect(rangoCuarto('Cuarto subproducto')).toEqual({ minimo: -2, maximo: 6 });
    expect(rangoCuarto('Refrigeración #5')).toEqual({ minimo: -4, maximo: 4 });
    expect(rangoCuarto('Sala marinado')).toEqual({ minimo: null, maximo: null });
  });
});
