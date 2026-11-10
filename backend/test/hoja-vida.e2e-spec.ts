/** D-34 · Carga de la hoja de vida de maquinaria (AC-PMT-FR05) desde Excel. */
import ExcelJS from 'exceljs';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { bootstrap } from './util';
import { hoy } from '../src/maintenance/maintenance.service';
import { leerPeriodicidad, leerReferencia, separarTareas } from '../src/import/hoja-vida';
import { UnidadFrecuencia } from '../src/common/enums';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let tec: { id: string; token: string };
const FOTO = readFileSync(join(__dirname, 'fixtures', 'firma.png'));
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const masDias = (n: number) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Un libro como el de la planta: una pestaña por máquina, con fotos. */
async function libro(maquinas: Array<{ codigo: string | null; serie: string; refs: string[] }>) {
  const wb = new ExcelJS.Workbook();
  const foto = wb.addImage({ buffer: FOTO as unknown as ExcelJS.Buffer, extension: 'png' });
  maquinas.forEach((m, i) => {
    const ws = wb.addWorksheet(`Termoformadora (${i + 1})`);
    ws.mergeCells('C1:L4'); ws.getCell('C1').value = 'HOJA DE VIDA DE MAQUINARIA Y EQUIPOS';
    ws.getCell('A5').value = 'NOMBRE DEL EQUIPO O MAQUINARIA: TERMOFORMADORA';
    ws.getCell('A6').value = 'DESCRIPCION: EMPACAR EN VACIO';
    ws.getCell('A7').value = 'AREA DEL EQUIPO: PROCESOS'; ws.getCell('I7').value = 'UBICACIÓN: EMPAQUE AL VACIO';
    ws.getCell('A8').value = `CÓDIGO INVENTARIO: ${m.codigo ?? ''}`; ws.getCell('D8').value = 'MARCA: VARIOVAC'; ws.getCell('K8').value = 'MODELO: OPTIMUS';
    ws.getCell('D9').value = `N° DE SERIE: ${m.serie}`; ws.getCell('K9').value = 'VOLTAJE: 220 V';
    ws.getCell('A10').value = 'AMPERAJE: 42 A'; ws.getCell('D10').value = 'CAPACIDAD: 100 m3/h'; ws.getCell('I10').value = 'PESO: 1081 kgs';
    ws.getCell('E12').value = 'UBICACIÓN DEL MANUAL'; ws.getCell('H12').value = 'MANTENIMIENTO';
    ws.getCell('L12').value = 'ESTADO DEL EQUIPO:'; ws.getCell('N12').value = 'OPERATIVO';
    ws.getCell('A16').value = 'ACTIVIDAD'; ws.getCell('I16').value = 'PERIODICIDAD'; ws.getCell('K16').value = 'MATERIALES A UTILIZAR';
    ws.getCell('A17').value = 'Limpiar y desinfectar la maquina.'; ws.getCell('I17').value = 'Diario';
    ws.mergeCells('A18:H19');
    ws.getCell('A18').value = 'Aceitar la cadena de transporte.Limpiar placa de sellado.'; ws.getCell('I18').value = 'Trimestral'; ws.getCell('K18').value = 'Aceite-Grasa';
    ws.getCell('A20').value = 'Cambiar oring de la estacion de sellado.'; ws.getCell('I20').value = '2 Años';
    ws.getCell('A21').value = 'Revisar algo raro.'; ws.getCell('I21').value = 'Cuando se pueda';
    ws.getCell('A24').value = 'REFERENCIAS DE MATERIALES';
    m.refs.forEach((r, k) => { ws.getCell(`A${25 + k}`).value = r; });
    ws.getCell('A30').value = 'REGISTRO FOTOGRAFICO DEL EQUIPO';
    ws.addImage(foto, 'A1:B3'); // logo
    ws.addImage(foto, 'A32:E40');
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const subir = (ruta: string, archivo: Buffer, campos: Record<string, string> = {}, token = c.admin) => {
  let r = c.http.post(`/api/hojas-de-vida/${ruta}`).set(c.auth(token)).attach('archivo', archivo, { filename: 'termoformadoras.xlsx', contentType: XLSX });
  for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
  return r;
};

beforeAll(async () => {
  c = await bootstrap();
  tec = await c.usuario('tec1', 'TECNICO', '5931');
});
afterAll(() => c.app.close());

describe('D-34 · Lectura del formato', () => {
  it('periodicidades, referencias y tareas', () => {
    expect(leerPeriodicidad('Trimestral').frecuencia).toEqual({ valor: 3, unidad: UnidadFrecuencia.MESES });
    expect(leerPeriodicidad('2 Años').frecuencia).toEqual({ valor: 24, unidad: UnidadFrecuencia.MESES });
    expect(leerPeriodicidad('cada 15 días').frecuencia).toEqual({ valor: 15, unidad: UnidadFrecuencia.DIAS });
    expect(leerPeriodicidad('Diario')).toEqual({ frecuencia: null, diaria: true });
    expect(leerPeriodicidad('Cuando se pueda')).toEqual({ frecuencia: null, diaria: false });
    expect(leerReferencia('Empaque 3x2: A1074843 Cantida 3 hay 2 en almacen')).toMatchObject({ nombre: 'Empaque 3x2', codigo: 'A1074843', cantidad: 3 });
    expect(leerReferencia('Grasa: Tipo NLGI2')).toMatchObject({ nombre: 'Grasa', codigo: null });
    expect(leerReferencia('Cuchilla Movil: MINI-MARTOR N°28').codigo).toBeNull();
    expect(separarTareas('Revisar moldes y pulir.Verificar sensores. Revizar resortes. ')).toEqual(['Revisar moldes y pulir', 'Verificar sensores', 'Revizar resortes']);
  });
});

describe('D-34 · Cargar la hoja de vida', () => {
  let archivo: Buffer;
  const fechas = () => JSON.stringify({ '3-MESES': masDias(10), '24-MESES': masDias(30) });

  beforeAll(async () => {
    archivo = await libro([
      { codigo: 'AP-TF-04', serie: 'OL-2590', refs: ['Grasa: Tipo NLGI2', 'Empaque 2x2: A1022992 Cantida 2', 'Aceite Mineral: OKS370'] },
      { codigo: 'ap-tf-03', serie: 'OL-2490', refs: ['Empaque 3x2: A1022992 Cantida 1'] },
    ]);
  });

  it('solo el administrador', async () => {
    expect((await subir('revisar', archivo, {}, tec.token)).status).toBe(403);
  });

  it('la revisión describe lo que se va a cargar sin guardar nada', async () => {
    const r = await subir('revisar', archivo);
    expect(r.status).toBe(201);
    expect(r.body.errores).toBe(0);
    expect(r.body.periodicidades.map((p: { clave: string; texto: string }) => [p.clave, p.texto])).toEqual([['3-MESES', 'trimestral'], ['24-MESES', 'cada 2 años']]);
    expect(r.body.tareasNuevas).toBe(3);
    expect(r.body.repuestosNuevos).toEqual([{ codigo: 'A1022992', descripcion: 'Empaque 2x2 (Termoformadora)' }, { codigo: 'OKS370', descripcion: 'Aceite Mineral (Termoformadora)' }]);
    const [h1, h2] = r.body.hojas;
    expect(h1).toMatchObject({
      codigo: 'AP-TF-04', accion: 'CREAR', fotos: 1,
      datos: { nombre: 'Termoformadora', area: 'Procesos', ubicacion: 'Empaque al vacio', marca: 'VARIOVAC', modelo: 'OPTIMUS', serie: 'OL-2590', voltaje: '220 V', amperaje: '42 A', ubicacionManual: 'Mantenimiento', estado: 'OPERATIVO' },
      diarias: ['Limpiar y desinfectar la maquina.'],
    });
    expect(h1.planes.map((p: { nombre: string; tareas: string[] }) => [p.nombre, p.tareas])).toEqual([
      ['Preventivo trimestral', ['Aceitar la cadena de transporte', 'Limpiar placa de sellado']],
      ['Preventivo cada 2 años', ['Cambiar oring de la estacion de sellado']],
    ]);
    expect(h1.advertencias.join(' ')).toContain('"Cuando se pueda"');
    expect(h2.codigo).toBe('AP-TF-03');
    expect(h2.advertencias.join(' ')).toContain('El código A1022992 aparece aquí como "Empaque 3x2"');
    expect((await c.http.get('/api/activos').set(c.auth(c.admin))).body).toHaveLength(0);
  });

  it('sin las fechas del primer preventivo no carga nada', async () => {
    const r = await subir('cargar', archivo, { fechas: JSON.stringify({ '3-MESES': masDias(10) }) });
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('primer preventivo cada 2 años');
    expect((await c.http.get('/api/activos').set(c.auth(c.admin))).body).toHaveLength(0);
  });

  it('una pestaña con error (sin código) impide cargar todo el archivo', async () => {
    const malo = await libro([{ codigo: 'AP-TF-09', serie: 'X1', refs: [] }, { codigo: null, serie: 'X2', refs: [] }]);
    const rev = (await subir('revisar', malo)).body;
    expect(rev.errores).toBe(1);
    expect(rev.hojas[1].errores[0]).toContain('CÓDIGO INVENTARIO');
    const r = await subir('cargar', malo, { fechas: fechas() });
    expect(r.status).toBe(400);
    expect((await c.http.get('/api/activos').set(c.auth(c.admin))).body).toHaveLength(0);
  });

  it('crea las máquinas con fotos, tareas, planes con su primera orden y la lista de materiales', async () => {
    const r = await subir('cargar', archivo, { fechas: fechas(), crearRepuestos: 'true' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ creadas: 2, actualizadas: 0, fotos: 2, tareasCreadas: 3, repuestosCreados: 2, materiales: 3 });
    expect(r.body.planes).toHaveLength(4);
    const activos = (await c.http.get('/api/activos').set(c.auth(c.admin))).body as Array<{ id: string; codigo: string }>;
    const tf4 = activos.find((a) => a.codigo === 'AP-TF-04')!;
    const ficha = (await c.http.get(`/api/activos/${tf4.id}`).set(c.auth(c.admin))).body;
    expect(ficha).toMatchObject({ nombre: 'Termoformadora', fabricante: 'VARIOVAC', modelo: 'OPTIMUS', serie: 'OL-2590', capacidad: '100 m3/h', peso: '1081 kgs', clase: 'EQUIPO' });
    expect(ficha.notas).toContain('Rutina diaria del operario (no genera órdenes): Limpiar y desinfectar la maquina.');
    expect(ficha.notas).toContain('Referencias de materiales: Grasa: Tipo NLGI2 · Empaque 2x2: A1022992 Cantida 2 · Aceite Mineral: OKS370');
    expect(ficha.documentos.map((d: { nombreOriginal: string; mime: string }) => [d.nombreOriginal, d.mime])).toEqual([['Foto 1 AP-TF-04.png', 'image/png']]);
    const mats = (await c.http.get(`/api/activos/${tf4.id}/materiales`).set(c.auth(c.admin))).body;
    expect(mats.origen).toBe('EQUIPO');
    expect(mats.materiales.map((m: { repuesto: { codigo: string }; cantidad: number }) => `${m.repuesto.codigo}×${m.cantidad}`).sort()).toEqual(['A1022992×2', 'OKS370×1']);
    const planes = (await c.http.get('/api/planes').set(c.auth(c.admin))).body.filter((p: { activoId: string }) => p.activoId === tf4.id);
    const trim = planes.find((p: { nombre: string }) => p.nombre === 'Preventivo trimestral');
    expect(trim).toMatchObject({ frecuenciaValor: 3, frecuenciaUnidad: 'MESES', prioridad: 'MEDIA', tareas: 'Materiales: Aceite-Grasa' });
    expect(trim.tareasPlan.map((t: { tarea: { nombre: string; grupo: string } }) => [t.tarea.nombre, t.tarea.grupo])).toEqual([
      ['Aceitar la cadena de transporte', 'Termoformadora'], ['Limpiar placa de sellado', 'Termoformadora'],
    ]);
    const ot = r.body.planes.find((p: { codigo: string; plan: string }) => p.codigo === 'AP-TF-04' && p.plan === 'Preventivo cada 2 años');
    expect(ot.fecha).toBe(masDias(30));
    expect(planes.find((p: { nombre: string }) => p.nombre === 'Preventivo cada 2 años').diasAviso).toBe(15);
  });

  it('volver a cargar el mismo archivo actualiza sin duplicar planes, fotos, tareas ni materiales', async () => {
    const r = await subir('cargar', archivo, { fechas: fechas() });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ creadas: 0, actualizadas: 2, fotos: 0, tareasCreadas: 0, repuestosCreados: 0, materiales: 0, planes: [] });
    expect((await c.http.get('/api/planes').set(c.auth(c.admin))).body).toHaveLength(4);
  });

  it('un archivo que no es de Excel se rechaza', async () => {
    const r = await c.http.post('/api/hojas-de-vida/revisar').set(c.auth(c.admin)).attach('archivo', FOTO, { filename: 'foto.png', contentType: 'image/png' });
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('.xlsx');
  });
});

describe('Libros grandes (fotos del celular)', () => {
  it('acepta un libro de más de 25 MB con fotos pesadas', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Banda 1');
    ws.getCell('C1').value = 'HOJA DE VIDA DE MAQUINARIA Y EQUIPOS';
    ws.getCell('A5').value = 'NOMBRE DEL EQUIPO O MAQUINARIA: BANDA TRANSPORTADORA';
    ws.getCell('A8').value = 'CÓDIGO INVENTARIO: BT-GRANDE-01';
    ws.getCell('A30').value = 'REGISTRO FOTOGRAFICO DEL EQUIPO';
    // Fotos de 8 MB que no se comprimen (como las de un celular): el libro queda en unos 32 MB.
    for (let i = 0; i < 4; i++) {
      const pesada = Buffer.concat([FOTO, randomBytes(8 * 1024 * 1024)]);
      ws.addImage(wb.addImage({ buffer: pesada as unknown as ExcelJS.Buffer, extension: 'png' }), `A${32 + i * 10}:E${40 + i * 10}`);
    }
    const archivo = Buffer.from(await wb.xlsx.writeBuffer());
    expect(archivo.length).toBeGreaterThan(30 * 1024 * 1024);
    const r = await subir('revisar', archivo);
    expect(r.status).toBe(201);
    expect(r.body.hojas[0]).toMatchObject({ fotos: 4 });
  }, 60_000);

  it('más de 100 MB se rechaza', async () => {
    const r = await subir('revisar', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(101 * 1024 * 1024)]));
    expect(r.status).toBe(413);
  }, 60_000);
});
