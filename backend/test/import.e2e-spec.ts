/** INT-01 · Carga inicial masiva de máquinas y repuestos desde Excel. */
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { bootstrap } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let tec: { token: string };

const binario = (res: NodeJS.ReadableStream & { setEncoding: (e: string) => void; on: (ev: string, cb: (x?: unknown) => void) => void }, cb: (err: Error | null, body: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (d) => partes.push(d as Buffer));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

/** Arma un .xlsx con la hoja y filas dadas (la primera fila son los encabezados). */
async function xlsx(hoja: string, filas: unknown[][], extra?: (ws: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja);
  filas.forEach((f) => ws.addRow(f));
  extra?.(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const H_MAQ = ['Código *', 'Nombre *', 'Área *', 'Ubicación', 'Fabricante', 'Modelo', 'Serie', 'Código SAP', 'Fecha de compra', 'Fin de garantía', 'Estado', 'Notas', 'Tipo de equipo'];
const H_REP = ['Código *', 'Descripción *', 'Unidad *', 'Ubicación', 'Código SAP', 'Stock mínimo', 'Stock inicial', 'Costo unitario'];

const subir = (ruta: string, buf: Buffer, nombre = 'carga.xlsx', token = c.admin) =>
  c.http.post(`/api/importacion/${ruta}`).set(c.auth(token)).attach('archivo', buf, { filename: nombre, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

beforeAll(async () => {
  c = await bootstrap();
  tec = await c.usuario('tec1', 'TECNICO', '4826');
  // Una máquina y un repuesto que ya existen
  await c.http.post('/api/activos').set(c.auth(c.admin)).send({ codigo: 'MOL-001', nombre: 'Molino', area: 'Proceso' }).expect(201);
  await c.http.post('/api/repuestos').set(c.auth(c.admin)).send({ codigo: 'RP-EXISTE', descripcion: 'Existente', unidad: 'UND' }).expect(201);
}, 60000);
afterAll(() => c.app.close());

describe('INT-01 · Plantillas', () => {
  it.each(['maquinas', 'repuestos'])('la plantilla de %s se descarga y tiene los encabezados e instrucciones', async (tipo) => {
    const r = await c.http.get(`/api/importacion/${tipo}/plantilla`).set(c.auth(c.admin)).buffer(true).parse(binario as never);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.headers['content-disposition']).toContain(`plantilla-${tipo}.xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    const ws = wb.worksheets[0];
    const enc = (ws.getRow(1).values as unknown[]).slice(1);
    expect(enc).toEqual(tipo === 'maquinas' ? H_MAQ : H_REP);
    expect(wb.getWorksheet('Instrucciones')).toBeDefined();
  });

  it('la plantilla vacía no carga nada', async () => {
    const r = await c.http.get('/api/importacion/maquinas/plantilla').set(c.auth(c.admin)).buffer(true).parse(binario as never);
    const v = await subir('maquinas/validar', r.body);
    expect(v.status).toBe(400);
    expect(v.body.message).toContain('no tiene datos');
  });
});

describe('INT-01 · Validación con número de fila', () => {
  it('informa cada error con su fila y columna, sin guardar nada', async () => {
    const buf = await xlsx('Máquinas', [
      H_MAQ,
      ['EMB-010', 'Embutidora', 'Proceso', 'Sala 1', 'Handtmann', 'VF', 'S1', 'SAP-1', new Date(Date.UTC(2022, 6, 1)), '01/07/2027', 'Operativo', ''],
      ['', 'Sin código', 'Proceso'],                          // fila 3: código vacío
      ['EMB-010', 'Repetida', 'Proceso'],                     // fila 4: repetido en el archivo
      ['MOL-001', 'Ya existe', 'Proceso'],                    // fila 5: ya existe
      ['HRN 01', 'Con espacio', 'Cocción'],                   // fila 6: código inválido
      ['HRN-002', 'Horno', ''],                               // fila 7: área vacía
      ['CF-002', 'Cuarto frío', 'Frío', '', '', '', '', '', '31/02/2024'], // fila 8: fecha inexistente
      ['CF-003', 'Cuarto frío', 'Frío', '', '', '', '', '', '2024-05-01', '2023-01-01'], // fila 9: garantía antes de compra
      ['CF-004', 'Cuarto frío', 'Frío', '', '', '', '', '', '', '', 'Averiada'], // fila 10: estado inválido
      [],                                                     // fila 11: vacía, se ignora
      ['CF-005', 'Cuarto frío 5', 'Frío'],                    // fila 12: bien
    ]);
    const r = await subir('maquinas/validar', buf);
    expect(r.status).toBe(201);
    expect(r.body.filas).toBe(11 - 1); // la fila vacía no cuenta
    expect(r.body.validas).toBe(2);
    const e = r.body.errores.map((x: { fila: number; columna: string; mensaje: string }) => `${x.fila}|${x.columna}|${x.mensaje}`);
    expect(e).toEqual([
      '3|Código|Es obligatorio',
      '4|Código|EMB-010 está repetido (también en la fila 2)',
      '5|Código|MOL-001 ya existe en el sistema',
      '6|Código|Use solo letras, números, punto, guion o barra, sin espacios (2 a 40)',
      '7|Área|Es obligatorio',
      '8|Fecha de compra|La fecha no existe',
      '9|Fin de garantía|Es anterior a la fecha de compra',
      '10|Estado|"Averiada" no es un estado válido: use Operativo o Dado de baja',
    ]);
    expect(r.body.vistaPrevia[0]).toMatchObject({ fila: 2, codigo: 'EMB-010', fechaCompra: '2022-07-01', fechaFinGarantia: '2027-07-01', estado: 'OPERATIVO' });
    expect(r.body.registros).toBeUndefined();
    const lista = await c.http.get('/api/activos').set(c.auth(c.admin));
    expect(lista.body.map((a: { codigo: string }) => a.codigo)).toEqual(['MOL-001']);
  });

  it('con errores la carga se rechaza completa y devuelve la lista de errores', async () => {
    const buf = await xlsx('Máquinas', [H_MAQ, ['OK-001', 'Bien', 'Proceso'], ['MOL-001', 'Ya existe', 'Proceso']]);
    const r = await subir('maquinas', buf);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('El archivo tiene 1 error; no se cargó nada');
    expect(r.body.errores).toEqual([{ fila: 3, columna: 'Código', mensaje: 'MOL-001 ya existe en el sistema' }]);
    const lista = await c.http.get('/api/activos').set(c.auth(c.admin));
    expect(lista.body).toHaveLength(1);
  });

  it('los números aceptan formato colombiano y valida negativos y decimales', async () => {
    const buf = await xlsx('Repuestos', [
      H_REP,
      ['RP-A', 'Correa', 'und', '', '', '2', '1.250', '12.500,50'],  // 1250 unidades a 12500,5
      ['RP-B', 'Grasa', 'kg', '', '', '0,5', '3,25', 18000],
      ['RP-C', 'Filtro', 'UND', '', '', '-1'],                        // fila 4: negativo
      ['RP-D', 'Filtro', 'UND', '', '', '', 'diez'],                  // fila 5: no es número
      ['RP-E', 'Filtro', 'UND', '', '', '', 5],                       // fila 6: sin costo con stock
      ['RP-F', 'Filtro', 'UND', '', '', '', 1.23456, 10],             // fila 7: demasiados decimales
    ]);
    const r = await subir('repuestos/validar', buf);
    expect(r.body.errores.map((x: { fila: number; columna: string }) => `${x.fila}|${x.columna}`)).toEqual([
      '4|Stock mínimo', '5|Stock inicial', '6|Costo unitario', '7|Stock inicial',
    ]);
    expect(r.body.vistaPrevia).toEqual([
      expect.objectContaining({ codigo: 'RP-A', unidad: 'UND', stockMinimo: 2, stockInicial: 1250, costoUnitario: 12500.5 }),
      expect.objectContaining({ codigo: 'RP-B', unidad: 'KG', stockMinimo: 0.5, stockInicial: 3.25, costoUnitario: 18000 }),
    ]);
  });

  it('las columnas se reconocen sin importar el orden, tildes ni mayúsculas; fórmulas toman su resultado', async () => {
    const buf = await xlsx('Hoja1', [
      ['area', 'CODIGO', 'nombre', 'notas'],
      ['Proceso', 'ORD-001', 'Ordenada distinta', 'x'],
    ], (ws) => { ws.getCell('C3').value = { formula: 'A2&"!"', result: 'Con fórmula' }; ws.getCell('A3').value = 'Proceso'; ws.getCell('B3').value = { richText: [{ text: 'ord-' }, { text: '002' }] }; });
    const r = await subir('maquinas/validar', buf);
    expect(r.body.errores).toEqual([]);
    expect(r.body.vistaPrevia.map((x: { codigo: string; nombre: string }) => `${x.codigo} ${x.nombre}`)).toEqual(['ORD-001 Ordenada distinta', 'ORD-002 Con fórmula']);
  });

  it('lee archivos guardados con otros programas (comentarios de celda, hoja con otro nombre)', async () => {
    const buf = readFileSync(join(__dirname, 'fixtures', 'otro-programa-con-comentarios.xlsx'));
    const r = await subir('maquinas/validar', buf);
    expect(r.status).toBe(201);
    expect(r.body.errores).toEqual([]);
    expect(r.body.vistaPrevia).toEqual([expect.objectContaining({ fila: 2, codigo: 'PY-001', fechaCompra: '2021-05-04' })]);
  });

  it('avisa si faltan columnas o si se subió la plantilla equivocada', async () => {
    const r1 = await subir('maquinas/validar', await xlsx('X', [['Código', 'Nombre'], ['A-1', 'B']]));
    expect(r1.status).toBe(400);
    expect(r1.body.message).toBe('Faltan columnas obligatorias: Área. Use la plantilla descargada desde la app.');
    const r2 = await subir('maquinas/validar', await xlsx('Repuestos', [H_REP, ['RP-1', 'X', 'UND']]));
    expect(r2.body.message).toBe('Este archivo parece la plantilla de repuestos. Use la plantilla de máquinas.');
  });

  it('solo acepta .xlsx de verdad (firma), con mensaje claro para .xls', async () => {
    const pdf = await subir('maquinas/validar', Buffer.from('%PDF-1.4 x'), 'carga.xlsx');
    expect(pdf.status).toBe(400);
    expect(pdf.body.message).toContain('Solo se aceptan archivos de Excel (.xlsx)');
    const xls = await subir('maquinas/validar', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(100)]), 'viejo.xls');
    expect(xls.body.message).toContain('guárdelo como "Libro de Excel (.xlsx)"');
    const roto = await subir('maquinas/validar', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]));
    expect(roto.body.message).toContain('No se pudo leer el archivo');
    const sin = await c.http.post('/api/importacion/maquinas/validar').set(c.auth(c.admin));
    expect(sin.status).toBe(400);
    const tipo = await subir('usuarios/validar', await xlsx('X', [['a']]));
    expect(tipo.status).toBe(400);
    expect(tipo.body.message).toContain('Tipo de carga inválido');
  });

  it('rechaza archivos de más de 2.000 filas', async () => {
    const filas: unknown[][] = [H_MAQ];
    for (let i = 0; i < 2001; i++) filas.push([`M-${i}`, 'Máquina', 'Proceso']);
    const r = await subir('maquinas/validar', await xlsx('Máquinas', filas));
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('más de 2.000 filas');
  });
});

describe('INT-01 · Carga', () => {
  it('máquinas: los totales cargados coinciden con el archivo', async () => {
    const filas: unknown[][] = [H_MAQ];
    for (let i = 1; i <= 120; i++) filas.push([`PR-${String(i).padStart(3, '0')}`, `Máquina ${i}`, i % 3 === 0 ? 'Cocción' : 'Proceso', '', '', '', '', '', '', '', i === 120 ? 'Dado de baja' : '']);
    const buf = await xlsx('Máquinas', filas);
    const v = await subir('maquinas/validar', buf);
    expect(v.body).toMatchObject({ filas: 120, validas: 120, errores: [], totales: { registros: 120, porArea: { Proceso: 80, Cocción: 40 }, dadasDeBaja: 1 } });
    const r = await subir('maquinas', buf, 'maquinas planta.xlsx');
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ tipo: 'maquinas', cargados: 120, totales: v.body.totales });
    const lista = await c.http.get('/api/activos').set(c.auth(c.admin));
    expect(lista.body.filter((a: { codigo: string }) => a.codigo.startsWith('PR-'))).toHaveLength(120);
    expect(lista.body.find((a: { codigo: string }) => a.codigo === 'PR-120').estado).toBe('DADO_DE_BAJA');
    // Subir el mismo archivo otra vez: todo ya existe, no se duplica nada
    const otra = await subir('maquinas', buf);
    expect(otra.status).toBe(400);
    expect(otra.body.errores).toHaveLength(120);
  });

  it('repuestos: crea el saldo inicial en el kárdex con su costo y los totales coinciden', async () => {
    const buf = await xlsx('Repuestos', [
      H_REP,
      ['RP-ROD-6205', 'Rodamiento 6205-2RS', 'UND', 'A-1', 'SAP-77', 4, 10, 18500],
      ['RP-GRA-01', 'Grasa grado alimenticio', 'KG', 'B-2', '', 1, '2,5', '64.000'],
      ['RP-SIN', 'Sin stock aún', 'UND', '', '', 2, '', ''],
    ]);
    const v = await subir('repuestos/validar', buf);
    expect(v.body.totales).toEqual({ registros: 3, conStock: 2, unidades: 12.5, valor: 10 * 18500 + 2.5 * 64000 });
    const r = await subir('repuestos', buf);
    expect(r.status).toBe(201);
    expect(r.body.cargados).toBe(3);

    const lista = (await c.http.get('/api/repuestos').set(c.auth(c.admin))).body as Array<{ id: string; codigo: string; stock: number; costoPromedio: number; codigoSap: string | null }>;
    const rod = lista.find((x) => x.codigo === 'RP-ROD-6205')!;
    expect(rod).toMatchObject({ stock: 10, costoPromedio: 18500, codigoSap: 'SAP-77' });
    expect(lista.find((x) => x.codigo === 'RP-GRA-01')).toMatchObject({ stock: 2.5, costoPromedio: 64000 });
    expect(lista.find((x) => x.codigo === 'RP-SIN')).toMatchObject({ stock: 0 });
    const valor = lista.filter((x) => ['RP-ROD-6205', 'RP-GRA-01', 'RP-SIN'].includes(x.codigo)).reduce((s, x) => s + x.stock * x.costoPromedio, 0);
    expect(valor).toBe(v.body.totales.valor);

    const k = await c.http.get(`/api/repuestos/${rod.id}/kardex`).set(c.auth(c.admin));
    const movs = k.body.items ?? k.body.movimientos ?? k.body;
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: 'ENTRADA_INICIAL', cantidad: 10, costoUnitario: 18500, referencia: 'CARGA-INICIAL' });
  });

  it('el saldo inicial solo puede ser el primer movimiento de un repuesto', async () => {
    const lista = (await c.http.get('/api/repuestos').set(c.auth(c.admin))).body as Array<{ id: string; codigo: string }>;
    const rod = lista.find((x) => x.codigo === 'RP-ROD-6205')!;
    const r = await c.http.post('/api/inventario/movimientos').set(c.auth(c.admin)).send({ repuestoId: rod.id, tipo: 'ENTRADA_INICIAL', cantidad: 1, costoUnitario: 1 });
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('el saldo inicial solo puede ser el primero');
  });

  it('la carga queda en la bitácora con el archivo y los totales', async () => {
    const b = await c.http.get('/api/bitacora?entidad=activo').set(c.auth(c.admin));
    const carga = b.body.items.find((x: { accion: string }) => x.accion === 'CARGA_MASIVA');
    expect(carga.detalle).toMatchObject({ tipo: 'maquinas', archivo: 'maquinas planta.xlsx', registros: 120 });
  });
});

describe('INT-01 · Permisos', () => {
  it('solo el administrador descarga plantillas y carga', async () => {
    expect((await c.http.get('/api/importacion/maquinas/plantilla').set(c.auth(tec.token))).status).toBe(403);
    expect((await subir('repuestos', await xlsx('R', [H_REP, ['RP-X', 'X', 'UND']]), 'x.xlsx', tec.token)).status).toBe(403);
    expect((await c.http.get('/api/importacion/maquinas/plantilla')).status).toBe(401);
  });
});
