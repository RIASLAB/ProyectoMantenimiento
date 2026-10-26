/** Notificaciones por evento y bandeja (NOT-01, NOT-02), incluidos los avisos al celular (Web Push). */
import { createECDH, randomBytes } from 'crypto';
import * as webpush from 'web-push';
import { bootstrap } from './util';

// Claves de avisos solo para esta prueba: con ellas el servidor activa el envío al celular.
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = 'mailto:pruebas@example.com';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
type U = { id: string; token: string };
type N = { id: string; tipo: string; titulo: string; cuerpo: string | null; enlace: string | null; leidaEn: string | null };
let c: Ctx;
let tec: U;
let tec2: U;
let op: U;
let aut: U;
let aut2: U;
let activoId: string;
let rodId: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let svc: any;
let hoy: () => string;

const bandeja = async (token: string) => (await c.http.get('/api/notificaciones').set(c.auth(token))).body as { items: N[]; noLeidas: number };
const tipos = async (token: string) => (await bandeja(token)).items.map((n) => n.tipo);
const limpiar = async (...tokens: string[]) => {
  for (const t of tokens) await c.http.post('/api/notificaciones/leidas').set(c.auth(t)).expect(200);
};
const nuevas = async (token: string) => (await bandeja(token)).items.filter((n) => !n.leidaEn);
const sumarDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

/** Suscripción como la que entrega un navegador (claves reales para que el cifrado funcione). */
function suscripcion(host = 'fcm.googleapis.com') {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://${host}/fcm/send/${randomBytes(12).toString('hex')}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

beforeAll(async () => {
  c = await bootstrap();
  const { NotificationsService } = await import('../src/notifications/notifications.service');
  svc = c.app.get(NotificationsService);
  hoy = (await import('../src/maintenance/maintenance.service')).hoy;
  tec = await c.usuario('tec', 'TECNICO', '5821');
  tec2 = await c.usuario('tec2', 'TECNICO', '7394');
  op = await c.usuario('op1', 'OPERARIO', '4826');
  aut = await c.usuario('aut', 'AUTORIZADOR', 'Autoriza2026');
  aut2 = await c.usuario('aut2', 'AUTORIZADOR', 'Autoriza2027');
  await c.http.put('/api/parametros/autorizador').set(c.auth(c.admin)).send({ usuarioId: aut.id }).expect(200);
  activoId = (await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'EMB-1', nombre: 'Embutidora', area: 'Proceso' })).body.id;
  rodId = (await c.http.post('/api/repuestos').set(c.auth(c.admin)).send({ codigo: 'ROD-1', descripcion: 'Rodamiento 6205', unidad: 'UND', stockMinimo: 2 })).body.id;
  await c.http.post('/api/inventario/movimientos').set(c.auth(c.admin)).send({ repuestoId: rodId, tipo: 'ENTRADA_COMPRA', cantidad: 3, costoUnitario: 100 }).expect(201);
  await limpiar(c.admin, tec.token, tec2.token, op.token, aut.token, aut2.token);
});

afterAll(async () => {
  await c?.app.close();
});

let otId: string;

describe('NOT-01 · Nueva falla → mantenimiento', () => {
  it('el reporte del operario le llega a administradores y técnicos, no a él ni al autorizador', async () => {
    const r = await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId, descripcion: 'Ruido fuerte en el motor', maquinaParada: true });
    expect(r.status).toBe(201);
    otId = r.body.id;
    for (const t of [c.admin, tec.token, tec2.token]) {
      const [n] = await nuevas(t);
      expect(n).toMatchObject({ tipo: 'FALLA_REPORTADA', titulo: 'Máquina parada: EMB-1 · Embutidora', enlace: `/ordenes/${otId}` });
      expect(n.cuerpo).toMatch(/^OT-\d{6} · Ruido fuerte en el motor — Usuario op1$/);
    }
    expect(await nuevas(op.token)).toHaveLength(0);
    expect(await nuevas(aut.token)).toHaveLength(0);
  });

  it('un reporte reenviado al sincronizar (mismo clientId) no avisa dos veces', async () => {
    await limpiar(c.admin);
    const body = { activoId, descripcion: 'Fuga de aceite', maquinaParada: false, clientId: '5d2c7a3e-1f4b-4c8e-9a6d-2b7e8f9a0c1d' };
    await c.http.post('/api/ordenes').set(c.auth(op.token)).send(body).expect(201);
    await c.http.post('/api/ordenes').set(c.auth(op.token)).send(body).expect(201);
    expect((await nuevas(c.admin)).map((n) => n.titulo)).toEqual(['Falla reportada: EMB-1 · Embutidora']);
  });

  it('un usuario desactivado no recibe notificaciones', async () => {
    await c.http.patch(`/api/usuarios/${tec2.id}`).set(c.auth(c.admin)).send({ activo: false }).expect(200);
    await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId, descripcion: 'Banda suelta', maquinaParada: false }).expect(201);
    await c.http.patch(`/api/usuarios/${tec2.id}`).set(c.auth(c.admin)).send({ activo: true }).expect(200);
    tec2.token = await c.login('tec2', '7394');
    expect((await nuevas(tec2.token)).map((n) => n.cuerpo)).not.toContainEqual(expect.stringContaining('Banda suelta'));
  });
});

describe('NOT-02 · Bandeja en la app', () => {
  it('muestra las notificaciones con el contador de no leídas', async () => {
    const b = await bandeja(tec.token);
    expect(b.noLeidas).toBe(3);
    expect(b.items[0].tipo).toBe('FALLA_REPORTADA');
    expect((await c.http.get('/api/notificaciones/contador').set(c.auth(tec.token))).body).toEqual({ noLeidas: 3 });
  });

  it('marcar como leída baja el contador; nadie puede marcar las de otro', async () => {
    const [n] = (await bandeja(tec.token)).items;
    expect((await c.http.post(`/api/notificaciones/${n.id}/leida`).set(c.auth(tec2.token))).status).toBe(404);
    const r = await c.http.post(`/api/notificaciones/${n.id}/leida`).set(c.auth(tec.token));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ noLeidas: 2 });
    expect((await bandeja(tec.token)).items.find((x) => x.id === n.id)!.leidaEn).not.toBeNull();
  });

  it('marcar todas como leídas', async () => {
    expect((await c.http.post('/api/notificaciones/leidas').set(c.auth(tec.token))).body).toEqual({ noLeidas: 0 });
    expect((await bandeja(tec.token)).noLeidas).toBe(0);
  });

  it('cada usuario solo ve las suyas', async () => {
    const ids = new Set((await bandeja(c.admin)).items.map((n) => n.id));
    expect((await bandeja(op.token)).items.some((n) => ids.has(n.id))).toBe(false);
  });

  it('requiere sesión', async () => {
    expect((await c.http.get('/api/notificaciones')).status).toBe(401);
  });
});

describe('MNT-04 · Asignación → técnico', () => {
  it('el técnico asignado recibe aviso; quien reportó se entera al cerrar', async () => {
    await limpiar(tec.token, op.token);
    await c.http.post(`/api/ordenes/${otId}/asignar`).set(c.auth(c.admin)).send({ tecnicoId: tec.id }).expect(201);
    const [n] = await nuevas(tec.token);
    expect(n).toMatchObject({ tipo: 'OT_ASIGNADA', enlace: `/ordenes/${otId}` });
    expect(n.titulo).toMatch(/^Le asignaron OT-\d{6}: EMB-1 · Embutidora$/);
    expect(n.cuerpo).toMatch(/máquina parada/);

    await c.http.post(`/api/ordenes/${otId}/iniciar`).set(c.auth(tec.token)).expect(201);
    await c.http.post(`/api/ordenes/${otId}/cerrar`).set(c.auth(tec.token)).send({ trabajoRealizado: 'Se cambió el rodamiento', repuestosUsados: [], manoObra: [], finParada: new Date().toISOString() }).expect(201);
    expect((await nuevas(op.token))[0]).toMatchObject({ tipo: 'FALLA_ATENDIDA', titulo: 'Falla atendida: EMB-1 · Embutidora' });
  });

  it('un técnico que toma una orden para sí mismo no se avisa a sí mismo', async () => {
    const o = (await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId, descripcion: 'Sensor sucio', maquinaParada: false })).body;
    await limpiar(tec.token);
    await c.http.post(`/api/ordenes/${o.id}/asignar`).set(c.auth(tec.token)).send({ tecnicoId: tec.id }).expect(201);
    expect(await nuevas(tec.token)).toHaveLength(0);
  });
});

describe('NOT-01 · Compras: autorizador y solicitante', () => {
  let scId: string;
  let sc2Id: string;

  it('una solicitud nueva le llega al autorizador vigente', async () => {
    const r = await c.http.post('/api/compras').set(c.auth(tec.token)).send({ repuestoId: rodId, cantidad: 4, justificacion: 'Reserva para los preventivos de diciembre' });
    expect(r.status).toBe(201);
    scId = r.body.id;
    const [n] = await nuevas(aut.token);
    expect(n).toMatchObject({ tipo: 'COMPRA_SOLICITADA', enlace: `/compras/${scId}` });
    expect(n.titulo).toMatch(/^Solicitud de compra SC-\d{6}: ROD-1 × 4$/);
    expect(n.cuerpo).toBe('Rodamiento 6205 — Reserva para los preventivos de diciembre');
    expect(await nuevas(aut2.token)).toHaveLength(0);
  });

  it('la solicitud automática por faltante también le llega', async () => {
    await limpiar(aut.token);
    await c.http.post('/api/planes').set(c.auth(c.admin)).send({
      activoId, nombre: 'Cambio de rodamientos', frecuenciaValor: 3, frecuenciaUnidad: 'MESES', tecnicoId: tec.id, primeraFecha: '2030-01-15', repuestos: [{ repuestoId: rodId, cantidad: 10 }],
    }).expect(201);
    expect((await nuevas(aut.token))[0].titulo).toMatch(/^Solicitud de compra SC-\d{6}: ROD-1 × 7$/);
  });

  it('al aprobar se avisa al solicitante y a los administradores (que compran)', async () => {
    await limpiar(tec.token, c.admin);
    await c.http.post(`/api/compras/${scId}/aprobar`).set(c.auth(aut.token)).expect(201);
    for (const t of [tec.token, c.admin]) {
      const [n] = await nuevas(t);
      expect(n.tipo).toBe('COMPRA_APROBADA');
      expect(n.titulo).toMatch(/^Compra SC-\d{6} aprobada: ROD-1 · Rodamiento 6205$/);
    }
  });

  it('COM-06 · al rechazar el solicitante recibe el motivo', async () => {
    sc2Id = (await c.http.post('/api/compras').set(c.auth(tec.token)).send({ repuestoId: rodId, cantidad: 1, justificacion: 'Repuesto de emergencia' })).body.id;
    await limpiar(tec.token);
    await c.http.post(`/api/compras/${sc2Id}/rechazar`).set(c.auth(aut.token)).send({ motivo: 'Ya hay uno en camino' }).expect(201);
    expect((await nuevas(tec.token))[0]).toMatchObject({ tipo: 'COMPRA_RECHAZADA', cuerpo: 'Motivo: Ya hay uno en camino' });
  });

  it('COM-08 · al recibir el repuesto se avisa a quien lo pidió', async () => {
    await limpiar(tec.token);
    await c.http.post(`/api/compras/${scId}/recibir`).set(c.auth(c.admin)).send({ cantidadRecibida: 4, costoUnitario: 110 }).expect(201);
    const [n] = await nuevas(tec.token);
    expect(n.tipo).toBe('COMPRA_RECIBIDA');
    expect(n.titulo).toMatch(/recibida en bodega: ROD-1/);
    expect(n.cuerpo).toBe('Llegaron 4.');
  });

  it('COM-05 · el cambio de autorizador se notifica a los dos autorizadores', async () => {
    await limpiar(aut.token, aut2.token);
    await c.http.put('/api/parametros/autorizador').set(c.auth(c.admin)).send({ usuarioId: aut2.id }).expect(200);
    for (const t of [aut.token, aut2.token]) {
      const [n] = await nuevas(t);
      expect(n).toMatchObject({ tipo: 'AUTORIZADOR_CAMBIADO', titulo: 'Nuevo autorizador de compras: Usuario aut2' });
      expect(n.cuerpo).toMatch(/^Reemplaza a Usuario aut\. Cambio hecho por Admin Pruebas\./);
    }
    await c.http.put('/api/parametros/autorizador').set(c.auth(c.admin)).send({ usuarioId: aut.id }).expect(200);
  });
});

describe('NOT-01 · Calidad e inventario', () => {
  let puntoId: string;

  it('CAL-02 · una temperatura fuera de rango avisa a calidad (administradores); en rango no', async () => {
    puntoId = (await c.http.post('/api/calidad/puntos').set(c.auth(c.admin)).send({ activoId, nombre: 'Temperatura de cámara', minimo: 0, maximo: 4, frecuenciaHoras: 4 })).body.id;
    await limpiar(c.admin);
    await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId, valor: 3 }).expect(201);
    expect(await nuevas(c.admin)).toHaveLength(0);
    await c.http.post('/api/calidad/temperaturas').set(c.auth(op.token)).send({ puntoId, valor: 7.5, accionCorrectiva: 'Se cerró la puerta y se avisó' }).expect(201);
    const [n] = await nuevas(c.admin);
    expect(n).toMatchObject({ tipo: 'TEMPERATURA_FUERA_DE_RANGO', titulo: 'Temperatura fuera de rango: EMB-1 · 7,5 °C' });
    expect(n.cuerpo).toMatch(/Temperatura de cámara \(rango 0 a 4 °C\)\. Acción: Se cerró la puerta y se avisó — Usuario op1/);
  });

  it('INV-06 · un consumo que deja el stock bajo el mínimo avisa una vez (al cruzarlo)', async () => {
    // Stock: 3 + 4 recibidos = 7; mínimo 2. Salidas de 5 → 2 (no avisa), 1 → 1 (avisa), 1 → 0 (ya estaba abajo: no repite).
    await limpiar(c.admin);
    // El técnico consume repuestos al cerrar sus órdenes.
    const codigos: string[] = [];
    const salida = async (cantidad: number) => {
      const o = (await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId, descripcion: 'Vibración', maquinaParada: false })).body;
      codigos.push(o.codigo);
      await c.http.post(`/api/ordenes/${o.id}/asignar`).set(c.auth(tec.token)).send({ tecnicoId: tec.id }).expect(201);
      await c.http.post(`/api/ordenes/${o.id}/iniciar`).set(c.auth(tec.token)).expect(201);
      await c.http.post(`/api/ordenes/${o.id}/cerrar`).set(c.auth(tec.token)).send({ trabajoRealizado: 'Cambio de rodamiento', repuestosUsados: [{ repuestoId: rodId, cantidad }], manoObra: [] }).expect(201);
    };
    await salida(5);
    expect((await nuevas(c.admin)).filter((n) => n.tipo.startsWith('STOCK'))).toHaveLength(0);
    await salida(1);
    await salida(1);
    const n = (await nuevas(c.admin)).filter((x) => x.tipo.startsWith('STOCK'));
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ tipo: 'STOCK_BAJO_MINIMO', titulo: 'Stock bajo el mínimo: ROD-1 · Rodamiento 6205', enlace: `/inventario/${rodId}` });
    expect(n[0].cuerpo).toBe(`Quedan 1 UND (mínimo 2) · ${codigos[1]}. Considere pedir más.`);
  });
});

describe('MNT-06 · Preventivo próximo y vencido', () => {
  let prevId: string;
  let prevCodigo: string;

  it('avisa al técnico asignado cuando entra en los días de aviso, una sola vez', async () => {
    const fecha = sumarDias(hoy(), 3);
    const r = await c.http.post('/api/planes').set(c.auth(c.admin)).send({ activoId, nombre: 'Lubricación', frecuenciaValor: 1, frecuenciaUnidad: 'MESES', diasAviso: 5, tecnicoId: tec2.id, primeraFecha: fecha, repuestos: [] });
    expect(r.body).toHaveProperty('primeraOrden');
    prevId = r.body.primeraOrden.id;
    prevCodigo = r.body.primeraOrden.codigo;
    await limpiar(tec2.token, c.admin);

    // 10 días antes todavía no avisa
    expect(await svc.revisarPreventivos(sumarDias(fecha, -10))).toBe(0);
    expect(await svc.revisarPreventivos(hoy())).toBe(1);
    const [n] = await nuevas(tec2.token);
    expect(n).toMatchObject({ tipo: 'PREVENTIVO_PROXIMO', titulo: `Preventivo para el ${fecha.split('-').reverse().join('/')}: EMB-1 · Embutidora`, cuerpo: `${prevCodigo} · Lubricación`, enlace: `/ordenes/${prevId}` });
    expect(await svc.revisarPreventivos(hoy())).toBe(0);
    expect(await nuevas(tec2.token)).toHaveLength(1);
    expect(await nuevas(c.admin)).toHaveLength(0);
  });

  it('vencido: avisa al técnico y a los administradores', async () => {
    await limpiar(tec2.token);
    expect(await svc.revisarPreventivos(sumarDias(hoy(), 4))).toBe(2);
    expect((await nuevas(tec2.token))[0]).toMatchObject({ tipo: 'PREVENTIVO_VENCIDO', titulo: 'Preventivo vencido: EMB-1 · Embutidora' });
    expect((await nuevas(c.admin))[0].tipo).toBe('PREVENTIVO_VENCIDO');
  });

  it('una orden cerrada o cancelada ya no avisa', async () => {
    await c.http.post(`/api/ordenes/${prevId}/cancelar`).set(c.auth(c.admin)).send({ motivo: 'Prueba' }).expect(201);
    await limpiar(tec2.token, c.admin, tec.token);
    // La siguiente del plan queda a un mes: no está en el período de aviso.
    expect(await svc.revisarPreventivos(sumarDias(hoy(), 10))).toBe(0);
  });
});

describe('NOT-01 · Avisos al celular (Web Push)', () => {
  const sub = suscripcion();

  it('el servidor publica su clave pública', async () => {
    expect((await c.http.get('/api/notificaciones/push').set(c.auth(op.token))).body).toEqual({ clavePublica: vapid.publicKey });
  });

  it('solo acepta servicios de avisos conocidos y por HTTPS (no direcciones internas)', async () => {
    const malas = [suscripcion('192.168.0.10'), suscripcion('intranet.local'), { ...sub, endpoint: sub.endpoint.replace('https', 'http') }];
    for (const s of malas) expect((await c.http.post('/api/notificaciones/push').set(c.auth(tec.token)).send(s)).status).toBe(400);
    expect((await c.http.post('/api/notificaciones/push').set(c.auth(tec.token)).send({ endpoint: sub.endpoint, keys: {} })).status).toBe(400);
  });

  it('suscribe el celular y le envía cada aviso cifrado, una sola vez', async () => {
    await c.http.post('/api/notificaciones/push').set(c.auth(tec.token)).send(sub).expect(200);
    // El aviso se puede cifrar de verdad para esa suscripción
    expect(() => webpush.generateRequestDetails(sub, 'x')).not.toThrow();
    const enviados: Array<{ endpoint: string; payload: Record<string, unknown>; urgente: boolean }> = [];
    svc.enviar = async (s: { endpoint: string }, payload: string, urgente: boolean) => { enviados.push({ endpoint: s.endpoint, payload: JSON.parse(payload), urgente }); };
    await svc.despacharPush(); // descarta lo acumulado antes de suscribirse
    enviados.length = 0;

    await limpiar(tec.token);
    const o = (await c.http.post('/api/ordenes').set(c.auth(op.token)).send({ activoId, descripcion: 'Motor recalentado', maquinaParada: true })).body;
    expect(await svc.despacharPush()).toBe(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ endpoint: sub.endpoint, urgente: true, payload: { titulo: 'Máquina parada: EMB-1 · Embutidora', enlace: `/ordenes/${o.id}`, noLeidas: 1 } });
    expect(await svc.despacharPush()).toBe(0);
  });

  it('la prueba de avisos llega al celular del usuario', async () => {
    const enviados: string[] = [];
    svc.enviar = async (_s: unknown, payload: string) => { enviados.push(JSON.parse(payload).titulo); };
    const r = await c.http.post('/api/notificaciones/push/prueba').set(c.auth(tec.token));
    expect(r.body).toEqual({ ok: true, suscripciones: 1 });
    expect(enviados).toEqual(['Prueba de avisos']);
  });

  it('si el celular cambia de usuario, la suscripción pasa al nuevo', async () => {
    await c.http.post('/api/notificaciones/push').set(c.auth(tec2.token)).send(sub).expect(200);
    expect((await c.http.post('/api/notificaciones/push/prueba').set(c.auth(tec.token))).body.suscripciones).toBe(0);
    expect((await c.http.post('/api/notificaciones/push/prueba').set(c.auth(tec2.token))).body.suscripciones).toBe(1);
  });

  it('una suscripción vencida (410) se borra; el aviso sigue en la bandeja', async () => {
    svc.enviar = async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }); };
    await limpiar(tec2.token);
    await c.http.post('/api/notificaciones/push/prueba').set(c.auth(tec2.token)).expect(200);
    expect((await c.http.post('/api/notificaciones/push/prueba').set(c.auth(tec2.token))).body.suscripciones).toBe(0);
    expect((await nuevas(tec2.token)).map((n) => n.titulo)).toEqual(['Prueba de avisos', 'Prueba de avisos']);
  });

  it('dar de baja el celular (al salir de la sesión)', async () => {
    svc.enviar = async () => undefined;
    await c.http.post('/api/notificaciones/push').set(c.auth(op.token)).send(sub).expect(200);
    await c.http.post('/api/notificaciones/push/baja').set(c.auth(op.token)).send({ endpoint: sub.endpoint }).expect(200);
    expect((await c.http.post('/api/notificaciones/push/prueba').set(c.auth(op.token))).body.suscripciones).toBe(0);
  });
});
