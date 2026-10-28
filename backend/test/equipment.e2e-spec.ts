/**
 * Tipos de equipo (categoría + modelo) con su lista de materiales; equipos iguales registrados de una vez;
 * preventivo por tipo; conteo por tipo y área.
 */
import ExcelJS from 'exceljs';
import { bootstrap } from './util';

type Ctx = Awaited<ReturnType<typeof bootstrap>>;
let c: Ctx;
let tec: { id: string; token: string };
let op: { id: string; token: string };
const rep: Record<string, string> = {};
let miniSplit: string;
let molino: string;

const post = (path: string, body: object, token = c.admin) => c.http.post(`/api${path}`).set(c.auth(token)).send(body);
const get = (path: string, token = c.admin) => c.http.get(`/api${path}`).set(c.auth(token));
const patch = (path: string, body: object, token = c.admin) => c.http.patch(`/api${path}`).set(c.auth(token)).send(body);
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const masDias = (n: number) => new Date(Date.parse(`${hoy()}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  c = await bootstrap();
  tec = await c.usuario('tec1', 'TECNICO', '4826');
  op = await c.usuario('op1', 'OPERARIO', '7391');
  for (const [codigo, descripcion, unidad] of [['RP-FIL', 'Filtro mini split', 'UND'], ['RP-GAS', 'Gas R410A', 'KG'], ['RP-CUCH', 'Cuchilla molino', 'UND']]) {
    const r = await post('/repuestos', { codigo, descripcion, unidad });
    rep[codigo] = r.body.id;
    await post('/inventario/movimientos', { repuestoId: r.body.id, tipo: 'ENTRADA_COMPRA', cantidad: 10, costoUnitario: 1000 });
  }
}, 60000);
afterAll(() => c.app.close());

describe('Tipos de equipo y lista de materiales', () => {
  it('crea un modelo con su categoría y su lista de materiales', async () => {
    const r = await post('/tipos-equipo', {
      categoria: 'Aire acondicionado', nombre: 'Mini split 12.000 BTU', fabricante: 'Samsung', referencia: 'AR12',
      materiales: [{ repuestoId: rep['RP-FIL'], cantidad: 2 }, { repuestoId: rep['RP-GAS'], cantidad: 0.5 }, { repuestoId: rep['RP-FIL'], cantidad: 1 }],
    });
    expect(r.status).toBe(201);
    miniSplit = r.body.id;
    const m = await get(`/tipos-equipo/${miniSplit}`);
    expect(m.body).toMatchObject({ nombre: 'Mini split 12.000 BTU', categoria: { nombre: 'Aire acondicionado' }, equipos: [] });
    // Los repetidos se suman
    expect(m.body.materiales.map((x: { repuesto: { codigo: string }; cantidad: number }) => `${x.repuesto.codigo}×${x.cantidad}`).sort()).toEqual(['RP-FIL×3', 'RP-GAS×0.5']);
  });

  it('reutiliza la categoría sin importar mayúsculas y no repite nombres de modelo', async () => {
    const r = await post('/tipos-equipo', { categoria: 'aire ACONDICIONADO', nombre: 'Mini split 24.000 BTU', materiales: [] });
    expect(r.status).toBe(201);
    const cats = await get('/tipos-equipo/categorias');
    expect(cats.body).toEqual([expect.objectContaining({ nombre: 'Aire acondicionado', modelos: 2 })]);
    const dup = await post('/tipos-equipo', { categoria: 'Otra', nombre: 'mini split 12.000 btu', materiales: [] });
    expect(dup.status).toBe(409);
    const m = await post('/tipos-equipo', { categoria: 'Molino', nombre: 'Molino M-32', materiales: [{ repuestoId: rep['RP-CUCH'], cantidad: 1 }] });
    molino = m.body.id;
  });

  it('valida los repuestos de la lista', async () => {
    const r = await post('/tipos-equipo', { categoria: 'X', nombre: 'Con repuesto falso', materiales: [{ repuestoId: '00000000-0000-4000-8000-000000000000', cantidad: 1 }] });
    expect(r.status).toBe(400);
  });

  it('todos consultan los tipos; solo el administrador los edita', async () => {
    expect((await get('/tipos-equipo', op.token)).status).toBe(200);
    expect((await post('/tipos-equipo', { categoria: 'X', nombre: 'Y', materiales: [] }, tec.token)).status).toBe(403);
  });
});

describe('Equipos iguales y área', () => {
  it('registra 3 aires iguales de una vez con códigos consecutivos (sin copiar la serie)', async () => {
    const r = await post('/activos/varios', { codigo: 'aa-008', nombre: 'Aire acondicionado', area: 'Bodega', serie: 'S-1', modeloId: miniSplit, cantidad: 3 });
    expect(r.status).toBe(201);
    expect(r.body.creados.map((x: { codigo: string }) => x.codigo)).toEqual(['AA-008', 'AA-009', 'AA-010']);
    const a = await get(`/activos/${r.body.creados[0].id}`);
    expect(a.body).toMatchObject({ serie: null, area: 'Bodega', modeloEquipo: { nombre: 'Mini split 12.000 BTU', categoria: { nombre: 'Aire acondicionado' } } });
    expect(a.body.modeloEquipo.materiales).toHaveLength(2);
  });

  it('no deja crear códigos repetidos ni códigos que no terminan en número', async () => {
    const dup = await post('/activos/varios', { codigo: 'AA-010', nombre: 'Aire', area: 'Bodega', cantidad: 2 });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain('AA-010');
    const sin = await post('/activos/varios', { codigo: 'AIRE', nombre: 'Aire', area: 'Bodega', cantidad: 2 });
    expect(sin.status).toBe(400);
    expect((await post('/activos/varios', { codigo: 'B-1', nombre: 'Aire', area: 'Bodega', cantidad: 101 })).status).toBe(400);
  });

  it('cuenta cuántos equipos hay por tipo y área (ej. aires acondicionados en bodega)', async () => {
    await post('/activos', { codigo: 'AA-020', nombre: 'Aire oficina', area: 'Oficinas', modeloId: miniSplit });
    const baja = await post('/activos', { codigo: 'AA-021', nombre: 'Aire viejo', area: 'bodega', modeloId: miniSplit });
    await patch(`/activos/${baja.body.id}`, { estado: 'DADO_DE_BAJA' });
    await post('/activos', { codigo: 'MOL-001', nombre: 'Molino', area: 'Proceso', modeloId: molino });
    await post('/activos', { codigo: 'SIN-1', nombre: 'Equipo sin tipo', area: 'Bodega' });

    const cat = (await get('/tipos-equipo/categorias')).body.find((x: { nombre: string }) => x.nombre === 'Aire acondicionado');
    const r = await get(`/tipos-equipo/resumen?area=BODEGA&categoriaId=${cat.id}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(4);
    expect(r.body.enUso).toBe(3); // sin el dado de baja
    expect(r.body.filas.reduce((s: number, f: { dadosDeBaja: number }) => s + f.dadosDeBaja, 0)).toBe(1);

    const todo = await get('/tipos-equipo/resumen');
    expect(todo.body.filas).toContainEqual(expect.objectContaining({ categoria: 'Sin tipo', area: 'Bodega', total: 1 }));
    expect(todo.body.filas).toContainEqual(expect.objectContaining({ categoria: 'Aire acondicionado', area: 'Oficinas', total: 1 }));

    const lista = await get(`/activos?categoriaId=${cat.id}&area=bodega`);
    expect(lista.body.map((a: { codigo: string }) => a.codigo).sort()).toEqual(['AA-008', 'AA-009', 'AA-010', 'AA-021']);
    const csv = await get(`/tipos-equipo/resumen/exportar?categoriaId=${cat.id}`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('"Aire acondicionado";"Mini split 12.000 BTU";"Bodega";"4";"3"');
    expect((await get('/tipos-equipo/resumen', op.token)).status).toBe(403);
  });

  it('no elimina un tipo que tiene equipos; sí uno sin uso', async () => {
    expect((await c.http.delete(`/api/tipos-equipo/${miniSplit}`).set(c.auth(c.admin))).status).toBe(409);
    const libre = (await get('/tipos-equipo')).body.find((m: { nombre: string }) => m.nombre === 'Mini split 24.000 BTU');
    expect((await c.http.delete(`/api/tipos-equipo/${libre.id}`).set(c.auth(c.admin))).status).toBe(200);
  });
});

describe('Preventivo por tipo de equipo', () => {
  let plantilla: string;

  it('exige máquina o tipo, no ambos', async () => {
    const base = { nombre: 'Limpieza', frecuenciaValor: 2, frecuenciaUnidad: 'MESES', primeraFecha: masDias(5), repuestos: [] };
    expect((await post('/planes', base)).status).toBe(400);
    const m = (await get('/activos?q=MOL-001')).body[0];
    expect((await post('/planes', { ...base, activoId: m.id, modeloId: molino })).status).toBe(400);
  });

  it('se aplica a todos los equipos del tipo (no a los dados de baja), cada uno con su orden y su lista de materiales', async () => {
    const r = await post('/planes', {
      modeloId: miniSplit, nombre: 'Limpieza de filtros y revisión de gas', frecuenciaValor: 2, frecuenciaUnidad: 'MESES',
      primeraFecha: masDias(5), tecnicoId: tec.id, repuestos: [{ repuestoId: rep['RP-FIL'], cantidad: 2 }],
    });
    expect(r.status).toBe(201);
    plantilla = r.body.plan.id;
    expect(r.body.equipos).toBe(4); // AA-008, 009, 010 y 020 (AA-021 está dado de baja)
    expect(r.body.primerasOrdenes.map((o: { activo: string }) => o.activo)).toEqual(['AA-008', 'AA-009', 'AA-010', 'AA-020']);

    const planes = (await get('/planes')).body as Array<{ id: string; plantillaId: string | null; activo: { codigo: string } | null; modeloEquipo: { nombre: string } | null }>;
    expect(planes.find((p) => p.id === plantilla)).toMatchObject({ activo: null, modeloEquipo: { nombre: 'Mini split 12.000 BTU' } });
    expect(planes.filter((p) => p.plantillaId === plantilla)).toHaveLength(4);

    const ots = (await get('/ordenes?tipo=PREVENTIVO&vista=abiertas')).body as Array<{ id: string; activo: { codigo: string }; fechaProgramada: string; estado: string }>;
    const ot = ots.find((o) => o.activo.codigo === 'AA-009')!;
    expect(ot).toMatchObject({ fechaProgramada: masDias(5), estado: 'ASIGNADA' });
    const d = await get(`/ordenes/${ot.id}`);
    expect(d.body.repuestos.map((x: { repuesto: { codigo: string }; cantidadPlanificada: number }) => `${x.repuesto.codigo}×${x.cantidadPlanificada}`)).toEqual(['RP-FIL×2']);
  });

  it('el plan de cada equipo se edita desde el plan del tipo, que actualiza a todos', async () => {
    const hijo = ((await get('/planes')).body as Array<{ id: string; plantillaId: string | null }>).find((p) => p.plantillaId === plantilla)!;
    const r = await patch(`/planes/${hijo.id}`, { frecuenciaValor: 1 });
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('Mini split 12.000 BTU');

    await patch(`/planes/${plantilla}`, { frecuenciaValor: 3, repuestos: [{ repuestoId: rep['RP-FIL'], cantidad: 2 }, { repuestoId: rep['RP-GAS'], cantidad: 1 }] }).expect(200);
    const hijos = ((await get('/planes')).body as Array<{ plantillaId: string | null; frecuenciaValor: number; repuestos: unknown[] }>).filter((p) => p.plantillaId === plantilla);
    expect(hijos.every((h) => h.frecuenciaValor === 3 && h.repuestos.length === 2)).toBe(true);
  });

  it('un equipo nuevo del tipo recibe el preventivo solo (también al crear varios)', async () => {
    const r = await post('/activos', { codigo: 'AA-030', nombre: 'Aire nuevo', area: 'Bodega', modeloId: miniSplit });
    expect(r.body.planesAplicados).toBe(1);
    const v = await post('/activos/varios', { codigo: 'AA-031', nombre: 'Aire nuevo', area: 'Producción', modeloId: miniSplit, cantidad: 2 });
    expect(v.body.planesAplicados).toBe(2);
    const ots = (await get('/ordenes?tipo=PREVENTIVO&vista=abiertas')).body as Array<{ activo: { codigo: string }; fechaProgramada: string }>;
    // La fecha del plan aún no ha pasado: el equipo nuevo usa esa misma fecha
    expect(ots.find((o) => o.activo.codigo === 'AA-032')!.fechaProgramada).toBe(masDias(5));
  });

  it('al asignarle el tipo a una máquina existente recibe el plan; al cambiarle el tipo, el plan anterior deja de generar', async () => {
    const sin = (await get('/activos?q=SIN-1')).body[0];
    await patch(`/activos/${sin.id}`, { modeloId: miniSplit }).expect(200);
    let planes = (await get(`/planes?activoId=${sin.id}`)).body as Array<{ plantillaId: string | null; vigente: boolean }>;
    expect(planes).toEqual([expect.objectContaining({ plantillaId: plantilla, vigente: true })]);

    await patch(`/activos/${sin.id}`, { modeloId: molino }).expect(200);
    planes = (await get(`/planes?activoId=${sin.id}`)).body;
    expect(planes).toEqual([expect.objectContaining({ plantillaId: null, vigente: false })]);
  });

  it('el plan del tipo desactivado desactiva el de todos sus equipos', async () => {
    await patch(`/planes/${plantilla}`, { vigente: false }).expect(200);
    const hijos = ((await get('/planes')).body as Array<{ plantillaId: string | null; vigente: boolean }>).filter((p) => p.plantillaId === plantilla);
    expect(hijos.length).toBeGreaterThan(0);
    expect(hijos.every((h) => !h.vigente)).toBe(true);
    const r = await post('/activos', { codigo: 'AA-040', nombre: 'Aire', area: 'Bodega', modeloId: miniSplit });
    expect(r.body.planesAplicados).toBe(0);
  });
});

describe('Materiales al reportar un correctivo', () => {
  it('mantenimiento puede planificar materiales al reportar; el operario no', async () => {
    const aa = (await get('/activos?q=AA-008')).body[0];
    const r = await post('/ordenes', { activoId: aa.id, descripcion: 'No enfría la bodega', maquinaParada: false, repuestos: [{ repuestoId: rep['RP-GAS'], cantidad: 1 }] }, tec.token);
    expect(r.status).toBe(201);
    const d = await get(`/ordenes/${r.body.id}`);
    expect(d.body.repuestos).toEqual([expect.objectContaining({ repuestoId: rep['RP-GAS'], cantidadPlanificada: 1 })]);
    const no = await post('/ordenes', { activoId: aa.id, descripcion: 'No enfría la bodega', maquinaParada: false, repuestos: [{ repuestoId: rep['RP-GAS'], cantidad: 1 }] }, op.token);
    expect(no.status).toBe(403);
  });
});

describe('Carga desde Excel con tipo de equipo', () => {
  const H = ['Código *', 'Nombre *', 'Área *', 'Ubicación', 'Fabricante', 'Modelo', 'Serie', 'Código SAP', 'Fecha de compra', 'Fin de garantía', 'Estado', 'Notas', 'Tipo de equipo'];
  const xlsx = async (filas: unknown[][]) => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Máquinas');
    filas.forEach((f) => ws.addRow(f));
    return Buffer.from(await wb.xlsx.writeBuffer());
  };
  const subir = (ruta: string, buf: Buffer) => c.http.post(`/api/importacion/${ruta}`).set(c.auth(c.admin))
    .attach('archivo', buf, { filename: 'm.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  it('asigna el tipo por nombre (sin importar mayúsculas) y avisa si no existe', async () => {
    const mal = await subir('maquinas/validar', await xlsx([H, ['XL-1', 'Molino 2', 'Proceso', '', '', '', '', '', '', '', '', '', 'molino m-32'], ['XL-2', 'Otro', 'Proceso', '', '', '', '', '', '', '', '', '', 'No existe']]));
    expect(mal.body.errores).toEqual([expect.objectContaining({ fila: 3, columna: 'Tipo de equipo', mensaje: expect.stringContaining('No existe el tipo de equipo "No existe"') })]);
    const ok = await subir('maquinas', await xlsx([H, ['XL-1', 'Molino 2', 'Proceso', '', '', '', '', '', '', '', '', '', 'molino m-32']]));
    expect(ok.status).toBe(201);
    const a = (await get('/activos?q=XL-1')).body[0];
    expect(a.modeloEquipo).toMatchObject({ nombre: 'Molino M-32' });
  });
});

describe('Equipos en bodega (comprados sin instalar)', () => {
  let molinos: Array<{ id: string; codigo: string }>;

  it('de 5 molinos iguales, 2 quedan en bodega; no cuentan como en uso', async () => {
    await post('/planes', { modeloId: molino, nombre: 'Afilado de cuchilla', frecuenciaValor: 1, frecuenciaUnidad: 'MESES', primeraFecha: masDias(3), repuestos: [{ repuestoId: rep['RP-CUCH'], cantidad: 1 }] }).expect(201);
    const r = await post('/activos/varios', { codigo: 'MOL-101', nombre: 'Molino', area: 'Proceso', modeloId: molino, cantidad: 5, enBodega: 2 });
    expect(r.status).toBe(201);
    molinos = r.body.creados;
    expect(r.body.planesAplicados).toBe(3); // los 2 de bodega no reciben preventivos
    const estados = await Promise.all(molinos.map(async (m) => (await get(`/activos/${m.id}`)).body.estado));
    expect(estados).toEqual(['OPERATIVO', 'OPERATIVO', 'OPERATIVO', 'EN_BODEGA', 'EN_BODEGA']);
    const res = await get(`/tipos-equipo/resumen?modeloId=${molino}`);
    expect(res.body).toMatchObject({ enBodega: 2 });
    expect(res.body.enUso).toBe(res.body.total - 2);
    expect((await post('/activos/varios', { codigo: 'MOL-201', nombre: 'Molino', area: 'Proceso', cantidad: 2, enBodega: 3 })).status).toBe(400);
  });

  it('una máquina en bodega no recibe reportes ni planes', async () => {
    const guardado = molinos[4];
    const f = await post('/ordenes', { activoId: guardado.id, descripcion: 'Ruido raro', maquinaParada: false }, tec.token);
    expect(f.status).toBe(400);
    expect(f.body.message).toContain('en bodega');
    const p = await post('/planes', { activoId: guardado.id, nombre: 'Plan', frecuenciaValor: 1, frecuenciaUnidad: 'MESES', primeraFecha: masDias(3), repuestos: [] });
    expect(p.status).toBe(400);
  });

  it('al instalarla queda operativa en su área y recibe el preventivo de su tipo', async () => {
    const guardado = molinos[4];
    expect((await post(`/activos/${guardado.id}/instalar`, { area: 'proceso' }, tec.token)).status).toBe(403);
    const r = await post(`/activos/${guardado.id}/instalar`, { area: 'proceso', ubicacion: 'Sala 2' });
    expect(r.status).toBe(201);
    expect(r.body.planesAplicados).toBe(1);
    expect((await get(`/activos/${guardado.id}`)).body).toMatchObject({ estado: 'OPERATIVO', area: 'Proceso', ubicacion: 'Sala 2' });
    const b = await get(`/bitacora?entidad=activo&entidadId=${guardado.id}`);
    expect(b.body.items[0]).toMatchObject({ accion: 'ACTIVO_INSTALADO' });
    expect((await post(`/activos/${guardado.id}/instalar`, { area: 'Proceso' })).status).toBe(400);
  });

  it('al guardarla en bodega se cancelan sus preventivos pendientes y sus planes dejan de generar; un correctivo abierto lo impide', async () => {
    const m = molinos[0];
    const falla = await post('/ordenes', { activoId: m.id, descripcion: 'Vibración fuerte', maquinaParada: false });
    const r = await patch(`/activos/${m.id}`, { estado: 'EN_BODEGA' });
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('sin terminar');
    await post(`/ordenes/${falla.body.id}/cancelar`, { motivo: 'Reporte duplicado' }).expect(201);

    await patch(`/activos/${m.id}`, { estado: 'EN_BODEGA' }).expect(200);
    const abiertas = ((await get('/ordenes?vista=abiertas')).body as Array<{ activo: { codigo: string } }>).filter((o) => o.activo.codigo === m.codigo);
    expect(abiertas).toHaveLength(0);
    const ots = (await get(`/ordenes?activoId=${m.id}&vista=todas`)).body as Array<{ id: string; tipo: string; estado: string }>;
    const prev = ots.find((o) => o.tipo === 'PREVENTIVO')!;
    expect(prev.estado).toBe('CANCELADA');
    expect((await get(`/ordenes/${prev.id}`)).body.motivoCancelacion).toBe('La máquina se guardó en bodega');
    const planes = (await get(`/planes?activoId=${m.id}`)).body as Array<{ vigente: boolean; plantillaId: string | null }>;
    expect(planes.every((p) => !p.vigente && p.plantillaId === null)).toBe(true);
    // Al instalarla de nuevo vuelve a recibir el plan de su tipo
    const r2 = await post(`/activos/${m.id}/instalar`, { area: 'Proceso' });
    expect(r2.body.planesAplicados).toBe(1);
  });
});
