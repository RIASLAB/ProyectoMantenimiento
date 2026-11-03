/** Mejoras de operación: avisos de rondas y checklists no hechos, Excel con datos técnicos, firmas, calibración y seguridad. */
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../src/notifications/notifications.service';
import { bootstrap, VERIF_OK } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
type U = { id: string; token: string };
let c: Ctx;
let tec: U;
let op: U;
let ds: DataSource;
let notif: NotificationsService;

const FIRMA = `data:image/png;base64,${readFileSync(`${__dirname}/fixtures/firma.png`).toString('base64')}`;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
/** Ayer a las HH:MM en la hora de la planta (Bogotá, UTC-5). */
const ayer = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() - 86_400_000));
const aLas = (hhmm: string) => new Date(`${ayer}T${hhmm}:00-05:00`);

beforeAll(async () => {
  c = await bootstrap();
  tec = await c.usuario('tec1', 'TECNICO', '5931');
  op = await c.usuario('op1', 'OPERARIO', '4826');
  ds = c.app.get(DataSource);
  notif = c.app.get(NotificationsService);
});

afterAll(async () => {
  await c?.app.close();
});

const avisos = async (token: string, tipo: string) =>
  ((await c.http.get('/api/notificaciones').set(c.auth(token))).body.items as Array<{ tipo: string; titulo: string; enlace: string }>).filter((n) => n.tipo === tipo);

describe('Avisos de rondas de temperatura y checklists diarios no hechos', () => {
  let plantillaId: string;

  beforeAll(async () => {
    for (const [codigo, nombre] of [['CF-A1', 'Cuarto de refrigeración'], ['CF-A2', 'Túnel de congelación']]) {
      const a = await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo, nombre, area: 'Planta Pollo', clase: 'INSTALACION' });
      await c.http.post('/api/calidad/puntos').set(c.auth(c.admin)).send({ activoId: a.body.id, nombre: 'Temperatura', minimo: -4, maximo: 4, frecuenciaHoras: 3 }).expect(201);
    }
    // Los puntos existen desde antes de ayer y nadie ha registrado.
    await ds.query(`UPDATE puntos_control SET creado_en = $1`, [new Date(aLas('10:00').getTime() - 2 * 86_400_000)]);
    const t = await c.http.post('/api/calidad/plantillas').set(c.auth(c.admin)).send({
      nombre: 'Preoperatorio diario · Planta Pollo', area: 'Planta Pollo', recordarHora: 9,
      items: [{ texto: 'Báscula de recepción', tipo: 'SI_NO', obligatorio: true, etiqueta: 'C_NC' }],
    });
    expect(t.body.recordarHora).toBe(9);
    plantillaId = t.body.id;
  });

  it('a las 8 a. m. avisa la ronda atrasada pero no el preoperatorio (se recuerda desde las 9)', async () => {
    const n = await notif.revisarCalidad(aLas('08:00'));
    expect(n).toBeGreaterThan(0);
    const r = await avisos(c.admin, 'RONDA_ATRASADA');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ titulo: 'Ronda de temperaturas pendiente: Planta Pollo', enlace: '/calidad/ronda?area=Planta%20Pollo' });
    expect(await avisos(tec.token, 'RONDA_ATRASADA')).toHaveLength(1);
    expect(await avisos(op.token, 'RONDA_ATRASADA')).toHaveLength(0);
    expect(await avisos(c.admin, 'CHECKLIST_PENDIENTE')).toHaveLength(0);
  });

  it('en la misma franja de 3 horas no repite; en la siguiente vuelve a avisar', async () => {
    await notif.revisarCalidad(aLas('08:45'));
    expect(await avisos(c.admin, 'RONDA_ATRASADA')).toHaveLength(1);
    await notif.revisarCalidad(aLas('09:15'));
    expect(await avisos(c.admin, 'RONDA_ATRASADA')).toHaveLength(2);
  });

  it('desde las 9 avisa el preoperatorio que no se ha llenado, una sola vez al día', async () => {
    const p = await avisos(c.admin, 'CHECKLIST_PENDIENTE');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ titulo: 'Falta llenar: Preoperatorio diario · Planta Pollo', enlace: `/calidad/checklist/${plantillaId}` });
    await notif.revisarCalidad(aLas('11:00'));
    expect(await avisos(c.admin, 'CHECKLIST_PENDIENTE')).toHaveLength(1);
  });

  it('con la ronda hecha y el preoperatorio lleno no hay avisos nuevos', async () => {
    const puntos = (await c.http.get('/api/calidad/puntos').set(c.auth(op.token))).body as Array<{ id: string }>;
    // Lecturas a las 11:30 de ayer (hora real del dispositivo, dentro de los 7 días permitidos).
    for (const p of puntos) {
      await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId: p.id, valor: 2, registradoEn: aLas('11:30').toISOString() }).expect(201);
    }
    const t = (await c.http.get(`/api/calidad/plantillas/${plantillaId}`).set(c.auth(op.token))).body;
    await c.http.post('/api/calidad/checklists').set(c.auth(op.token))
      .send({ plantillaId, respuestas: [{ itemId: t.items[0].id, valor: 'SI' }], registradoEn: aLas('11:30').toISOString() }).expect(201);
    const antes = (await avisos(c.admin, 'RONDA_ATRASADA')).length;
    expect(await notif.revisarCalidad(aLas('12:05'))).toBe(0);
    expect(await avisos(c.admin, 'RONDA_ATRASADA')).toHaveLength(antes);
  });

  it('fuera del horario de producción no avisa', async () => {
    const dia = ((aLas('12:00').getUTCDay() + 6) % 7) + 1;
    const otros = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== dia);
    await c.http.put('/api/indicadores/parametros').set(c.auth(c.admin)).send({ dias: otros, horaInicio: '06:00', horaFin: '22:00', metas: {} }).expect(200);
    expect(await notif.revisarCalidad(aLas('20:00'))).toBe(0);
    await c.http.put('/api/indicadores/parametros').set(c.auth(c.admin)).send({ dias: [1, 2, 3, 4, 5, 6, 7], horaInicio: '06:00', horaFin: '18:00', metas: {} }).expect(200);
    expect(await notif.revisarCalidad(aLas('20:00'))).toBe(0);
  });
});

describe('Carga desde Excel con la clase y los datos técnicos', () => {
  const H = ['Código *', 'Nombre *', 'Área *', 'Clase', 'Voltaje', 'Amperaje', 'Capacidad', 'Peso', 'Ubicación del manual'];
  const libro = async (filas: unknown[][]) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Máquinas');
    [H, ...filas].forEach((f) => ws.addRow(f));
    return Buffer.from(await wb.xlsx.writeBuffer());
  };
  const subir = (ruta: string, buf: Buffer) => c.http.post(`/api/importacion/${ruta}`).set(c.auth(c.admin))
    .attach('archivo', buf, { filename: 'carga.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  it('rechaza una clase desconocida', async () => {
    const r = await subir('maquinas/validar', await libro([['XL-1', 'Molino', 'Proceso', 'Vehículo']]));
    expect(r.body.errores[0]).toMatchObject({ fila: 2, columna: 'Clase' });
  });

  it('carga equipos e instalaciones con su hoja de vida', async () => {
    const r = await subir('maquinas', await libro([
      ['XL-1', 'Molino de carne', 'Proceso', '', '220 V', '12 A', '300 kg/h', '180 kg', 'Oficina de mantenimiento'],
      ['XL-2', 'Sala de desposte', 'Planta Desposte', 'Instalación', '', '', '', '', ''],
    ]));
    expect(r.status).toBe(201);
    expect(r.body.totales.instalaciones).toBe(1);
    const [m] = (await c.http.get('/api/activos?q=XL-1').set(c.auth(c.admin))).body;
    expect(m).toMatchObject({ clase: 'EQUIPO', voltaje: '220 V', amperaje: '12 A', capacidad: '300 kg/h', peso: '180 kg', ubicacionManual: 'Oficina de mantenimiento' });
    const [s] = (await c.http.get('/api/activos?q=XL-2').set(c.auth(c.admin))).body;
    expect(s.clase).toBe('INSTALACION');
  });
});

describe('Firmas en los formatos', () => {
  let otId: string;

  beforeAll(async () => {
    const a = await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'EMB-1', nombre: 'Embutidora', area: 'Proceso' });
    const o = await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId: a.body.id, descripcion: 'No arranca', maquinaParada: false });
    otId = o.body.id;
    await c.http.post(`/api/ordenes/${otId}/asignar`).set(c.auth(c.admin)).send({ tecnicoId: tec.id }).expect(201);
    await c.http.post(`/api/ordenes/${otId}/iniciar`).set(c.auth(tec.token)).expect(201);
    await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec.token)).send({ ...VERIF_OK, trabajoRealizado: 'Se cambió el contactor', repuestosUsados: [], manoObra: [] }).expect(201);
  });

  const firmar = (token: string, body: object) => c.http.post('/api/firmas').set(c.auth(token)).send({ entidad: 'OT', entidadId: otId, nombre: 'Persona Prueba', imagen: FIRMA, ...body });

  it('cualquiera firma su casilla; la del jefe solo un administrador o el autorizador', async () => {
    expect((await firmar(op.token, { casilla: 'RESPONSABLE' })).status).toBe(201);
    const jefe = await firmar(tec.token, { casilla: 'JEFE_MANTENIMIENTO' });
    expect(jefe.status).toBe(403);
    expect(jefe.body.message).toMatch(/la hace el jefe/);
    expect((await firmar(c.admin, { casilla: 'JEFE_MANTENIMIENTO', nombre: 'Jefe de Mantenimiento' })).status).toBe(201);
    // El líder de área no tiene usuario: firma en el celular del jefe con su nombre.
    expect((await firmar(c.admin, { casilla: 'LIDER_AREA', nombre: 'Líder de Producción', cargo: 'Líder de área' })).status).toBe(201);
  });

  it('una casilla se firma una sola vez y la firma no se puede cambiar', async () => {
    expect((await firmar(c.admin, { casilla: 'RESPONSABLE' })).status).toBe(409);
    await expect(ds.query(`UPDATE firmas SET nombre = 'otro'`)).rejects.toThrow(/solo inserción/);
    const l = await c.http.get(`/api/firmas?entidad=OT&entidadId=${otId}`).set(c.auth(op.token));
    expect(l.body.map((f: { casilla: string }) => f.casilla).sort()).toEqual(['JEFE_MANTENIMIENTO', 'LIDER_AREA', 'RESPONSABLE']);
    expect(l.body.find((f: { casilla: string }) => f.casilla === 'LIDER_AREA')).toMatchObject({ nombre: 'Líder de Producción', imagen: FIRMA });
    const b = await c.http.get('/api/bitacora?entidad=firma').set(c.auth(c.admin));
    expect(JSON.stringify(b.body)).toMatch(/FORMATO_FIRMADO/);
  });

  it('valida la imagen, la casilla y que el registro exista', async () => {
    expect((await firmar(c.admin, { casilla: 'OTRA' })).status).toBe(400);
    expect((await firmar(c.admin, { casilla: 'LIDER_AREA', entidadId: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);
    const noPng = `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`;
    expect((await c.http.post('/api/firmas').set(c.auth(c.admin)).send({ entidad: 'CHECKLIST', entidadId: otId, casilla: 'REALIZO', nombre: 'X Prueba', imagen: noPng })).status).toBe(400);
  });

  it('la planilla de temperaturas se firma por día y área, sin importar mayúsculas', async () => {
    const r = await c.http.post('/api/firmas').set(c.auth(c.admin))
      .send({ entidad: 'PLANILLA', entidadId: `${ayer}|planta pollo`, casilla: 'VERIFICO', nombre: 'Jefe de Mantenimiento', imagen: FIRMA });
    expect(r.status).toBe(201);
    expect(r.body.entidadId).toBe(`${ayer}|Planta Pollo`);
    expect((await c.http.post('/api/firmas').set(c.auth(c.admin))
      .send({ entidad: 'PLANILLA', entidadId: `${ayer}|PLANTA POLLO`, casilla: 'VERIFICO', nombre: 'Otro Jefe', imagen: FIRMA })).status).toBe(409);
    expect((await c.http.post('/api/firmas').set(c.auth(c.admin))
      .send({ entidad: 'PLANILLA', entidadId: `${ayer}|Planta Inexistente`, casilla: 'REALIZO', nombre: 'Alguien Aquí', imagen: FIRMA })).status).toBe(404);
  });

  it('el paquete mensual filtra las órdenes cerradas por área y fecha de cierre', async () => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const r = await c.http.get(`/api/ordenes?vista=cerradas&estado=CERRADA&area=proceso&cerradaDesde=${hoy}&cerradaHasta=${hoy}`).set(c.auth(c.admin));
    expect(r.body.map((o: { id: string }) => o.id)).toEqual([otId]);
    expect((await c.http.get(`/api/ordenes?vista=cerradas&area=Planta%20Pollo&cerradaDesde=${hoy}`).set(c.auth(c.admin))).body).toHaveLength(0);
  });
});

describe('Calibración de instrumentos', () => {
  let instId: string;

  it('el administrador registra el instrumento; empieza sin calibración', async () => {
    const body = { codigo: 'ter-001', nombre: 'Termómetro de punzón', tipo: 'TERMOMETRO', area: 'Planta Desposte', rango: '-50 a 150 °C', frecuenciaMeses: 12 };
    expect((await c.http.post('/api/instrumentos').set(c.auth(tec.token)).send(body)).status).toBe(403);
    const r = await c.http.post('/api/instrumentos').set(c.auth(c.admin)).send(body);
    expect(r.status).toBe(201);
    expect(r.body.codigo).toBe('TER-001');
    instId = r.body.id;
    expect((await c.http.post('/api/instrumentos').set(c.auth(c.admin)).send(body)).status).toBe(409);
    const l = await c.http.get('/api/instrumentos').set(c.auth(op.token));
    expect(l.body[0]).toMatchObject({ codigo: 'TER-001', estado: 'SIN_CALIBRAR', ultima: null });
  });

  const calibrar = (token: string, campos: Record<string, string>, archivo?: Buffer) => {
    const r = c.http.post(`/api/instrumentos/${instId}/calibraciones`).set(c.auth(token));
    for (const [k, v] of Object.entries(campos)) r.field(k, v);
    if (archivo) r.attach('archivo', archivo, { filename: 'certificado.pdf', contentType: 'application/pdf' });
    return r;
  };

  it('el técnico registra la calibración con su certificado; vence según la frecuencia', async () => {
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() - 400 * 86_400_000));
    const r = await calibrar(tec.token, { fecha, laboratorio: 'Metrología del Valle', numeroCertificado: 'MV-2025-118', resultado: 'APTO' }, PDF);
    expect(r.status).toBe(201);
    const [y, m, d] = fecha.split('-').map(Number);
    expect(r.body.venceEn).toBe(`${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    expect(r.body.archivoNombre).toBe('certificado.pdf');
    // Hace más de un año: ya está vencida.
    const det = await c.http.get(`/api/instrumentos/${instId}`).set(c.auth(op.token));
    expect(det.body.estado).toBe('VENCIDA');
    const cert = await c.http.get(`/api/instrumentos/calibraciones/${r.body.id}/certificado`).set(c.auth(op.token));
    expect(cert.status).toBe(200);
    expect(cert.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('avisa al jefe la calibración vencida una sola vez', async () => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    await notif.revisarCalibraciones(hoy);
    await notif.revisarCalibraciones(hoy);
    const a = await avisos(c.admin, 'CALIBRACION_VENCIDA');
    expect(a).toHaveLength(1);
    expect(a[0].titulo).toBe('Calibración vencida: TER-001 · Termómetro de punzón');
    expect(await avisos(tec.token, 'CALIBRACION_VENCIDA')).toHaveLength(0);
  });

  it('una calibración nueva la deja vigente; "no apto" exige explicar qué se hará', async () => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect((await calibrar(c.admin, { fecha: manana, laboratorio: 'Lab', resultado: 'APTO' })).status).toBe(400);
    expect((await calibrar(c.admin, { fecha: hoy, laboratorio: 'Lab', resultado: 'NO_APTO' })).status).toBe(400);
    expect((await calibrar(op.token, { fecha: hoy, laboratorio: 'Lab', resultado: 'APTO' })).status).toBe(403);
    const exe = await calibrar(c.admin, { fecha: hoy, laboratorio: 'Lab' , resultado: 'APTO' }, Buffer.from('MZ\x90\x00ejecutable'));
    expect(exe.status).toBe(400);
    expect((await calibrar(c.admin, { fecha: hoy, laboratorio: 'Metrología del Valle', resultado: 'APTO' })).status).toBe(201);
    const det = await c.http.get(`/api/instrumentos/${instId}`).set(c.auth(op.token));
    expect(det.body.estado).toBe('VIGENTE');
    expect(det.body.calibraciones).toHaveLength(2);
    await expect(ds.query(`DELETE FROM calibraciones`)).rejects.toThrow(/solo inserción/);
  });
});

describe('Seguridad: tope de intentos fallidos por equipo', () => {
  it('después de 30 intentos fallidos desde la misma IP responde 429, aunque se prueben usuarios distintos', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await c.http.post('/api/auth/login').send({ usuario: `noexiste${i}`, credencial: '1234' })).status).toBe(401);
    }
    const r = await c.http.post('/api/auth/login').send({ usuario: 'admin', credencial: 'Admin12345' });
    expect(r.status).toBe(429);
    expect(r.body.message).toMatch(/Demasiados intentos fallidos/);
  }, 60_000);
});
