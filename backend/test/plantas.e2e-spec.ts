/** D-45: planta de cada máquina; en el checklist de una planta solo van sus máquinas. */
import { bootstrap } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let op: { id: string; token: string };
let pollo: string;
let desposte: string;
let sinPlanta: string;
let plantillaId: string;
let itemId: string;

beforeAll(async () => {
  c = await bootstrap();
  op = await c.usuario('op1', 'OPERARIO', '4826');
  const crear = async (codigo: string, planta?: string) =>
    (await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo, nombre: 'Empacadora al vacío', area: 'Empaque', planta })).body;
  const p = await crear('EMP-P1', 'Planta Pollo');
  expect(p.planta).toBe('Planta Pollo');
  pollo = p.id;
  desposte = (await crear('EMP-D1', 'Planta Desposte')).id;
  sinPlanta = (await crear('EMP-X1')).id;
  const t = await c.http.post('/api/calidad/plantillas').set(c.auth(c.admin)).send({
    nombre: 'Preoperacional empacadora', plantas: ['Planta Pollo', 'Planta Desposte'], semanal: true,
    items: [{ texto: 'Sellado correcto', tipo: 'SI_NO', obligatorio: true }],
  });
  plantillaId = t.body.id;
  itemId = t.body.items[0].id;
});

afterAll(async () => {
  await c?.app.close();
});

it('la ficha guarda la planta; se puede quitar y filtrar', async () => {
  await c.http.patch(`/api/activos/${desposte}`).set(c.auth(c.admin)).send({ planta: 'Planta Salsamentaria' }).expect(200);
  await c.http.patch(`/api/activos/${desposte}`).set(c.auth(c.admin)).send({ planta: 'Planta Desposte' }).expect(200);
  const sin = (await c.http.get('/api/activos?planta=SIN').set(c.auth(c.admin))).body.map((a: { codigo: string }) => a.codigo);
  expect(sin).toEqual(['EMP-X1']);
  const dePollo = (await c.http.get('/api/activos?planta=Planta%20Pollo').set(c.auth(c.admin))).body.map((a: { codigo: string }) => a.codigo);
  expect(dePollo).toEqual(['EMP-P1']);
  // Plantas conocidas: las de las máquinas y las de los formatos.
  expect((await c.http.get('/api/activos/plantas').set(c.auth(op.token))).body).toEqual(['Planta Desposte', 'Planta Pollo']);
  const bit = (await c.http.get(`/api/bitacora?entidad=activo&entidadId=${desposte}`).set(c.auth(c.admin))).body.items;
  expect(bit.some((b: { detalle: { planta?: unknown } }) => b.detalle?.planta)).toBe(true);
});

it('una máquina de otra planta no se puede usar en el checklist de esta planta', async () => {
  const llenar = (activoId: string, planta: string) => c.http.post('/api/calidad/checklists').set(c.auth(op.token))
    .send({ plantillaId, activoId, planta, respuestas: [{ itemId, valor: 'SI' }] });
  const r = await llenar(desposte, 'Planta Pollo');
  expect(r.status).toBe(400);
  expect(r.body.message).toBe('La máquina EMP-D1 es de Planta Desposte, no de Planta Pollo');
  expect((await llenar(pollo, 'Planta Pollo')).status).toBe(201);
  // Las que aún no tienen planta se pueden usar en cualquiera.
  expect((await llenar(sinPlanta, 'Planta Pollo')).status).toBe(201);
});

it('la carga masiva lee la columna Planta', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Máquinas');
  ws.addRow(['Código *', 'Nombre *', 'Área *', 'Planta']);
  ws.addRow(['TAJ-S1', 'Tajadora', 'Proceso', 'Planta Salsamentaria']);
  ws.addRow(['TAJ-S2', 'Tajadora', 'Proceso', '']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const r = await c.http.post('/api/importacion/maquinas').set(c.auth(c.admin))
    .attach('archivo', buf, { filename: 'maquinas.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  expect(r.status).toBe(201);
  const l = (await c.http.get('/api/activos?q=TAJ-S').set(c.auth(c.admin))).body;
  expect(Object.fromEntries(l.map((a: { codigo: string; planta: string | null }) => [a.codigo, a.planta]))).toEqual({ 'TAJ-S1': 'Planta Salsamentaria', 'TAJ-S2': null });
});
