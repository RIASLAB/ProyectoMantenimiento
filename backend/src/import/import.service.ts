import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import ExcelJS from 'exceljs';
import { DataSource, In } from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { EstadoActivo, TipoMovimiento } from '../common/enums';
import { EquipmentModel } from '../equipment/equipment.entities';
import { InventoryService } from '../inventory/inventory.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { SparePart } from '../inventory/spare-part.entity';

/**
 * INT-01: carga inicial masiva de máquinas y repuestos desde una plantilla de Excel.
 * Primero se valida todo el archivo e informa cada error con su fila; la carga es todo o nada,
 * así los totales cargados siempre coinciden con el archivo.
 */
export type TipoCarga = 'maquinas' | 'repuestos';
export const TIPOS_CARGA: TipoCarga[] = ['maquinas', 'repuestos'];

export const MAX_FILAS = 2000;
export const MAX_BYTES = 5 * 1024 * 1024;
/** Filas leídas en total, incluidas las vacías con formato de la plantilla. */
const MAX_LEIDAS = 100_000;
const MAX_HOJAS = 20;
const CODIGO = /^[A-Za-z0-9._/-]{2,40}$/;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Valor = string | number | Date | null;
interface Columna {
  clave: string;
  titulo: string;
  obligatoria?: boolean;
  ancho: number;
  ayuda: string;
  /** Normaliza y valida el valor de la celda; devuelve el valor limpio o lanza un mensaje de error. */
  leer: (v: Valor) => unknown;
}

export interface ErrorFila { fila: number; columna: string | null; mensaje: string }
interface Hoja { nombre: string; encabezados: Map<string, number>; filas: Array<{ numero: number; valores: Valor[] }> }

// ---------- Lectura de celdas ----------

class ErrorCelda extends Error {}
const falla = (m: string): never => { throw new ErrorCelda(m); };

function texto(v: Valor, max: number, min = 0): string | null {
  if (v === null) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length < min) falla(`Debe tener al menos ${min} caracteres`);
  if (s.length > max) falla(`Máximo ${max} caracteres (tiene ${s.length})`);
  return s;
}

/** Números en formato colombiano o internacional: 1.234,5 · 1234,5 · 1234.5 */
function numero(v: Valor, { decimales, max }: { decimales: number; max: number }): number | null {
  if (v === null || v === '') return null;
  let n: number;
  if (typeof v === 'number') n = v;
  else if (v instanceof Date) return falla('Debe ser un número, no una fecha');
  else {
    let s = v.replace(/[\s$]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return falla(`"${v}" no es un número`);
    n = Number(s);
  }
  if (!Number.isFinite(n)) return falla('No es un número válido');
  if (n < 0) return falla('No puede ser negativo');
  if (n > max) return falla(`No puede ser mayor que ${max.toLocaleString('es-CO')}`);
  const f = 10 ** decimales;
  if (Math.abs(Math.round(n * f) - n * f) > 1e-6) return falla(`Máximo ${decimales} decimales`);
  return Math.round(n * f) / f;
}

const iso = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
};

/** Fechas como celda de fecha de Excel, AAAA-MM-DD o DD/MM/AAAA. */
function fecha(v: Valor): string | null {
  if (v === null || v === '') return null;
  let r: string | null = null;
  if (v instanceof Date) r = iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  else if (typeof v === 'number') return falla('Escriba la fecha como DD/MM/AAAA o use formato de fecha');
  else {
    const s = v.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) r = iso(+m[1], +m[2], +m[3]);
    else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) r = iso(+m[3], +m[2], +m[1]);
    else return falla(`"${s}" no es una fecha (use DD/MM/AAAA)`);
  }
  if (!r) return falla('La fecha no existe');
  if (r < '1950-01-01' || r > '2100-12-31') return falla('Fecha fuera de rango');
  return r;
}

const codigo = (v: Valor) => {
  const s = texto(v, 40);
  if (s === null) return null;
  if (!CODIGO.test(s)) falla('Use solo letras, números, punto, guion o barra, sin espacios (2 a 40)');
  return s.toUpperCase();
};

const ESTADOS: Record<string, EstadoActivo> = {
  operativo: EstadoActivo.OPERATIVO, operativa: EstadoActivo.OPERATIVO,
  'en bodega': EstadoActivo.EN_BODEGA, bodega: EstadoActivo.EN_BODEGA, 'sin instalar': EstadoActivo.EN_BODEGA,
  'dado de baja': EstadoActivo.DADO_DE_BAJA, 'dada de baja': EstadoActivo.DADO_DE_BAJA, baja: EstadoActivo.DADO_DE_BAJA,
};
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();

// ---------- Columnas de cada plantilla ----------

const COLUMNAS: Record<TipoCarga, Columna[]> = {
  maquinas: [
    { clave: 'codigo', titulo: 'Código', obligatoria: true, ancho: 14, ayuda: 'Código interno único, ej. EMB-002. Sin espacios.', leer: codigo },
    { clave: 'nombre', titulo: 'Nombre', obligatoria: true, ancho: 32, ayuda: 'Ej. Embutidora al vacío', leer: (v) => texto(v, 150, 2) },
    { clave: 'area', titulo: 'Área', obligatoria: true, ancho: 18, ayuda: 'Ej. Proceso, Refrigeración, Cocción', leer: (v) => texto(v, 100, 2) },
    { clave: 'ubicacion', titulo: 'Ubicación', ancho: 22, ayuda: 'Ej. Sala de embutido', leer: (v) => texto(v, 150) },
    { clave: 'fabricante', titulo: 'Fabricante', ancho: 18, ayuda: '', leer: (v) => texto(v, 100) },
    { clave: 'modelo', titulo: 'Modelo', ancho: 14, ayuda: '', leer: (v) => texto(v, 100) },
    { clave: 'serie', titulo: 'Serie', ancho: 14, ayuda: 'Número de serie', leer: (v) => texto(v, 100) },
    { clave: 'codigoSap', titulo: 'Código SAP', ancho: 14, ayuda: 'Opcional (D-13)', leer: (v) => texto(v, 40) },
    { clave: 'fechaCompra', titulo: 'Fecha de compra', ancho: 16, ayuda: 'DD/MM/AAAA', leer: fecha },
    { clave: 'fechaFinGarantia', titulo: 'Fin de garantía', ancho: 16, ayuda: 'DD/MM/AAAA, no anterior a la compra', leer: fecha },
    {
      clave: 'estado', titulo: 'Estado', ancho: 14, ayuda: 'Operativo (si se deja vacío), En bodega (comprada sin instalar) o Dado de baja. El resto lo calculan las órdenes de trabajo.',
      leer: (v) => {
        const s = texto(v, 40);
        if (s === null) return EstadoActivo.OPERATIVO;
        return ESTADOS[sinTildes(s)] ?? falla(`"${s}" no es un estado válido: use Operativo, En bodega o Dado de baja`);
      },
    },
    { clave: 'notas', titulo: 'Notas', ancho: 30, ayuda: '', leer: (v) => texto(v, 4000) },
    { clave: 'tipoEquipo', titulo: 'Tipo de equipo', ancho: 26, ayuda: 'Opcional. Nombre exacto del tipo creado en Máquinas → Tipos de equipo (ej. Mini split 12.000 BTU)', leer: (v) => texto(v, 120) },
  ],
  repuestos: [
    { clave: 'codigo', titulo: 'Código', obligatoria: true, ancho: 16, ayuda: 'Código interno único, ej. RP-ROD-6205. Sin espacios.', leer: codigo },
    { clave: 'descripcion', titulo: 'Descripción', obligatoria: true, ancho: 34, ayuda: 'Ej. Rodamiento 6205-2RS', leer: (v) => texto(v, 200, 2) },
    { clave: 'unidad', titulo: 'Unidad', obligatoria: true, ancho: 10, ayuda: 'Ej. UND, KG, L, M, CAJA', leer: (v) => texto(v, 20, 1)?.toUpperCase() ?? null },
    { clave: 'ubicacion', titulo: 'Ubicación', ancho: 18, ayuda: 'Ej. Estante A-3', leer: (v) => texto(v, 100) },
    { clave: 'codigoSap', titulo: 'Código SAP', ancho: 14, ayuda: 'Opcional (D-13)', leer: (v) => texto(v, 40) },
    { clave: 'stockMinimo', titulo: 'Stock mínimo', ancho: 13, ayuda: 'Vacío = 0', leer: (v) => numero(v, { decimales: 3, max: 10_000_000 }) ?? 0 },
    { clave: 'stockInicial', titulo: 'Stock inicial', ancho: 13, ayuda: 'Cantidad en bodega hoy. Vacío = 0', leer: (v) => numero(v, { decimales: 3, max: 10_000_000 }) ?? 0 },
    { clave: 'costoUnitario', titulo: 'Costo unitario', ancho: 14, ayuda: 'En pesos, sin IVA. Obligatorio si hay stock inicial', leer: (v) => numero(v, { decimales: 2, max: 1_000_000_000 }) },
  ],
};

const NOMBRE_HOJA: Record<TipoCarga, string> = { maquinas: 'Máquinas', repuestos: 'Repuestos' };

export interface FilaMaquina {
  fila: number; codigo: string; nombre: string; area: string; ubicacion: string | null; fabricante: string | null; modelo: string | null;
  serie: string | null; codigoSap: string | null; fechaCompra: string | null; fechaFinGarantia: string | null; estado: EstadoActivo; notas: string | null;
  modeloId: string | null;
}
export interface FilaRepuesto {
  fila: number; codigo: string; descripcion: string; unidad: string; ubicacion: string | null; codigoSap: string | null;
  stockMinimo: number; stockInicial: number; costoUnitario: number | null;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly maintenance: MaintenanceService,
  ) {}

  /** Plantilla con encabezados, ayudas y una hoja de instrucciones. */
  async plantilla(tipo: TipoCarga): Promise<Buffer> {
    const cols = COLUMNAS[tipo];
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CMMS Nutrialimentos';
    const ws = wb.addWorksheet(NOMBRE_HOJA[tipo], { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.obligatoria ? `${c.titulo} *` : c.titulo, key: c.clave, width: c.ancho }));
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.height = 22;
    h.alignment = { vertical: 'middle' };
    cols.forEach((c, i) => {
      const cell = h.getCell(i + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.obligatoria ? 'FF1F3A2E' : 'FF3E6B57' } };
      if (c.ayuda) cell.note = c.ayuda;
    });
    // Ayudas al llenar: lista de estados y formato de fecha/número en las primeras filas.
    for (let r = 2; r <= MAX_FILAS + 1; r++) {
      cols.forEach((c, i) => {
        const cell = ws.getRow(r).getCell(i + 1);
        if (c.clave === 'estado') cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Operativo,En bodega,Dado de baja"'] };
        if (c.clave.startsWith('fecha')) cell.numFmt = 'dd/mm/yyyy';
        if (c.clave === 'codigo') cell.numFmt = '@';
      });
    }

    const ins = wb.addWorksheet('Instrucciones');
    ins.columns = [{ width: 22 }, { width: 90 }];
    const lineas: Array<[string, string]> = [
      ['Cómo llenar', `${tipo === 'maquinas' ? 'Una máquina' : 'Un repuesto'} por fila en la hoja "${NOMBRE_HOJA[tipo]}", desde la fila 2. No cambie los encabezados.`],
      ['', 'Las columnas con * son obligatorias. Máximo ' + MAX_FILAS.toLocaleString('es-CO') + ' filas por archivo.'],
      ['', 'Los códigos deben ser únicos: no se aceptan repetidos en el archivo ni códigos que ya existan en el sistema.'],
      ['', 'La carga es todo o nada: si una fila tiene errores no se carga nada, y la app indica la fila y la columna para corregir.'],
      ...(tipo === 'repuestos'
        ? [['', 'El stock inicial se registra como "Saldo inicial" en el kárdex, con el costo unitario como costo promedio.'] as [string, string]]
        : [['', 'Los documentos (manuales, fichas) se adjuntan después en la ficha de cada máquina.'] as [string, string]]),
      ['', ''],
      ['Columna', 'Qué escribir'],
      ...cols.map((c): [string, string] => [`${c.titulo}${c.obligatoria ? ' *' : ''}`, c.ayuda || 'Opcional']),
    ];
    lineas.forEach((l) => ins.addRow(l));
    ins.getRow(1).font = { bold: true };
    ins.getRow(lineas.findIndex((l) => l[0] === 'Columna') + 1).font = { bold: true };
    ins.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Lee y valida el archivo sin guardar nada. */
  async analizar(tipo: TipoCarga, file: Express.Multer.File | undefined) {
    const hojas = await this.leerHojas(file);
    const cols = COLUMNAS[tipo];
    // La hoja se elige por sus encabezados (el nombre puede cambiar al guardar con otros programas).
    const ws = hojas.find((h) => this.completa(h, tipo)) ?? hojas.find((h) => sinTildes(h.nombre) === sinTildes(NOMBRE_HOJA[tipo])) ?? hojas[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');
    const enc = this.columnas(ws, tipo);
    if (!this.completa(ws, tipo)) {
      const otra = TIPOS_CARGA.find((t) => t !== tipo)!;
      const faltan = cols.filter((c) => c.obligatoria && !enc.has(c.clave));
      throw new BadRequestException(
        hojas.some((h) => this.completa(h, otra))
          ? `Este archivo parece la plantilla de ${NOMBRE_HOJA[otra].toLowerCase()}. Use la plantilla de ${NOMBRE_HOJA[tipo].toLowerCase()}.`
          : `Faltan columnas obligatorias: ${faltan.map((c) => c.titulo).join(', ')}. Use la plantilla descargada desde la app.`,
      );
    }

    const filas: Array<Record<string, unknown> & { fila: number }> = [];
    const errores: ErrorFila[] = [];
    for (const { numero: r, valores } of ws.filas) {
      const crudos = cols.map((c) => (enc.has(c.clave) ? valores[enc.get(c.clave)!] ?? null : null));
      if (crudos.every((v) => v === null || (typeof v === 'string' && !v.trim()))) continue; // fila vacía
      if (filas.length >= MAX_FILAS) {
        throw new BadRequestException(`El archivo tiene más de ${MAX_FILAS.toLocaleString('es-CO')} filas. Divídalo en varios archivos.`);
      }
      const limpio: Record<string, unknown> & { fila: number } = { fila: r };
      let ok = true;
      cols.forEach((c, i) => {
        try {
          const v = c.leer(crudos[i]);
          if (c.obligatoria && (v === null || v === '')) falla('Es obligatorio');
          limpio[c.clave] = v;
        } catch (e) {
          if (!(e instanceof ErrorCelda)) throw e;
          errores.push({ fila: r, columna: c.titulo, mensaje: e.message });
          ok = false;
        }
      });
      if (ok) this.reglasDeFila(tipo, limpio, errores);
      filas.push(limpio);
    }
    if (!filas.length) throw new BadRequestException('El archivo no tiene datos desde la fila 2');

    // Códigos repetidos en el archivo y ya existentes en el sistema.
    const porCodigo = new Map<string, number[]>();
    filas.forEach((f) => typeof f.codigo === 'string' && porCodigo.set(f.codigo, [...(porCodigo.get(f.codigo) ?? []), f.fila]));
    for (const [c, fs] of porCodigo) {
      if (fs.length > 1) fs.slice(1).forEach((fila) => errores.push({ fila, columna: 'Código', mensaje: `${c} está repetido (también en la fila ${fs[0]})` }));
    }
    const repo = tipo === 'maquinas' ? this.ds.getRepository(Asset) : this.ds.getRepository(SparePart);
    const codigos = [...porCodigo.keys()];
    for (let i = 0; i < codigos.length; i += 500) {
      const existentes = await repo.find({ select: { codigo: true }, where: { codigo: In(codigos.slice(i, i + 500)) } });
      existentes.forEach((x) => porCodigo.get(x.codigo)!.forEach((fila) => errores.push({
        fila, columna: 'Código', mensaje: `${x.codigo} ya existe en el sistema`,
      })));
    }

    // Tipo de equipo por nombre (sin importar mayúsculas): debe existir.
    if (tipo === 'maquinas') {
      const modelos = await this.ds.getRepository(EquipmentModel).find({ select: { id: true, nombre: true } });
      const porNombre = new Map(modelos.map((m) => [sinTildes(m.nombre), m.id]));
      for (const f of filas) {
        const n = f.tipoEquipo as string | null | undefined;
        delete f.tipoEquipo;
        f.modeloId = null;
        if (!n) continue;
        const id = porNombre.get(sinTildes(n));
        if (id) f.modeloId = id;
        else errores.push({ fila: f.fila, columna: 'Tipo de equipo', mensaje: `No existe el tipo de equipo "${n}". Créelo primero en Máquinas → Tipos de equipo` });
      }
    }

    errores.sort((a, b) => a.fila - b.fila);
    const conError = new Set(errores.map((e) => e.fila));
    const validas = filas.filter((f) => !conError.has(f.fila));
    return {
      tipo, filas: filas.length, validas: validas.length, errores,
      totales: this.totales(tipo, validas),
      vistaPrevia: validas.slice(0, 10),
      registros: validas,
    };
  }

  /** Valida y carga todo en una sola transacción; si hay un error no se carga nada. */
  async cargar(tipo: TipoCarga, file: Express.Multer.File | undefined, actor: SessionUser) {
    const a = await this.analizar(tipo, file);
    if (a.errores.length) {
      throw new BadRequestException({ message: `El archivo tiene ${a.errores.length} error${a.errores.length === 1 ? '' : 'es'}; no se cargó nada`, errores: a.errores });
    }
    const resultado = await this.ds.transaction(async (em) => {
      if (tipo === 'maquinas') {
        const filas = a.registros as unknown as FilaMaquina[];
        const repo = em.getRepository(Asset);
        const ids: string[] = [];
        for (let i = 0; i < filas.length; i += 200) {
          const r = await repo.insert(filas.slice(i, i + 200).map(({ fila: _f, ...m }) => repo.create(m)));
          ids.push(...r.identifiers.map((x) => x.id as string));
        }
        // Los equipos con tipo reciben los preventivos de su tipo.
        await this.maintenance.aplicarPlanesDeTipo(em, ids, actor);
      } else {
        const filas = a.registros as unknown as FilaRepuesto[];
        const repo = em.getRepository(SparePart);
        const creados: SparePart[] = [];
        for (let i = 0; i < filas.length; i += 200) {
          const lote = filas.slice(i, i + 200).map((r) => repo.create({
            codigo: r.codigo, descripcion: r.descripcion, unidad: r.unidad, ubicacion: r.ubicacion, codigoSap: r.codigoSap, stockMinimo: r.stockMinimo,
          }));
          await repo.insert(lote);
          creados.push(...lote);
        }
        const id = new Map(creados.map((c) => [c.codigo, c.id]));
        for (const r of filas) {
          if (r.stockInicial <= 0) continue;
          await this.inventory.registrarMovimiento(
            { repuestoId: id.get(r.codigo)!, tipo: TipoMovimiento.ENTRADA_INICIAL, cantidad: r.stockInicial, costoUnitario: r.costoUnitario ?? 0, motivo: 'Saldo inicial (carga masiva)', referencia: 'CARGA-INICIAL' },
            actor, { em },
          );
        }
      }
      await this.audit.log({
        usuarioId: actor.id, accion: 'CARGA_MASIVA', entidad: tipo === 'maquinas' ? 'activo' : 'repuesto', entidadId: null,
        detalle: { tipo, archivo: file?.originalname ?? null, registros: a.validas, totales: a.totales },
      }, em);
      return { tipo, cargados: a.validas, totales: a.totales };
    });
    return resultado;
  }

  // ---------- Internos ----------

  private reglasDeFila(tipo: TipoCarga, f: Record<string, unknown> & { fila: number }, errores: ErrorFila[]) {
    if (tipo === 'maquinas') {
      if (f.fechaCompra && f.fechaFinGarantia && (f.fechaFinGarantia as string) < (f.fechaCompra as string)) {
        errores.push({ fila: f.fila, columna: 'Fin de garantía', mensaje: 'Es anterior a la fecha de compra' });
      }
    } else if ((f.stockInicial as number) > 0 && f.costoUnitario === null) {
      errores.push({ fila: f.fila, columna: 'Costo unitario', mensaje: 'Es obligatorio cuando hay stock inicial' });
    }
  }

  private totales(tipo: TipoCarga, filas: Array<Record<string, unknown>>) {
    if (tipo === 'maquinas') {
      const porArea: Record<string, number> = {};
      filas.forEach((f) => { porArea[f.area as string] = (porArea[f.area as string] ?? 0) + 1; });
      return { registros: filas.length, porArea, dadasDeBaja: filas.filter((f) => f.estado === EstadoActivo.DADO_DE_BAJA).length };
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      registros: filas.length,
      conStock: filas.filter((f) => (f.stockInicial as number) > 0).length,
      unidades: Math.round(filas.reduce((s, f) => s + (f.stockInicial as number), 0) * 1000) / 1000,
      valor: r2(filas.reduce((s, f) => s + (f.stockInicial as number) * ((f.costoUnitario as number | null) ?? 0), 0)),
    };
  }

  /**
   * Lee las hojas con el lector por flujo de exceljs: solo valores, sin comentarios ni dibujos
   * (el lector completo falla con comentarios guardados por otros programas) y sin cargar todo en memoria.
   */
  private async leerHojas(file: Express.Multer.File | undefined): Promise<Hoja[]> {
    if (!file) throw new BadRequestException('Debe adjuntar un archivo en el campo "archivo"');
    if (file.size > MAX_BYTES) throw new BadRequestException(`El archivo supera ${MAX_BYTES / 1024 / 1024} MB`);
    // Un .xlsx es un ZIP: se comprueba la firma, no solo la extensión.
    const zip = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (!zip || !/\.xlsx$/i.test(file.originalname ?? '')) {
      const xls = file.buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
      throw new BadRequestException(xls
        ? 'El archivo es de Excel antiguo (.xls). Ábralo en Excel y guárdelo como "Libro de Excel (.xlsx)".'
        : 'Solo se aceptan archivos de Excel (.xlsx). Descargue la plantilla desde la app.');
    }
    const hojas: Hoja[] = [];
    let leidas = 0;
    try {
      const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(file.buffer), {
        worksheets: 'emit', sharedStrings: 'cache', styles: 'cache', hyperlinks: 'ignore', entries: 'ignore',
      });
      for await (const ws of reader) {
        const h: Hoja = { nombre: (ws as unknown as { name?: string }).name ?? '', encabezados: new Map(), filas: [] };
        for await (const row of ws as AsyncIterable<ExcelJS.Row>) {
          // Tope de filas leídas (incluidas las vacías con formato) para archivos comprimidos enormes.
          if (++leidas > MAX_LEIDAS) throw new BadRequestException('El archivo es demasiado grande. Use la plantilla y divídalo en varios archivos.');
          if (hojas.length >= MAX_HOJAS) continue;
          const valores = Array.from(row.values as unknown[], (v) => this.valor(v));
          if (row.number === 1) {
            valores.forEach((v, col) => { if (typeof v === 'string' && v.trim()) h.encabezados.set(sinTildes(v), col); });
          } else if (valores.some((v) => v !== null && !(typeof v === 'string' && !v.trim()))) {
            h.filas.push({ numero: row.number, valores });
          }
        }
        if (hojas.length < MAX_HOJAS) hojas.push(h);
      }
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException('No se pudo leer el archivo de Excel. Verifique que no esté dañado ni protegido con contraseña.');
    }
    return hojas;
  }

  /** Columna (índice) de cada campo según los encabezados, sin importar el orden, tildes ni mayúsculas. */
  private columnas(h: Hoja, tipo: TipoCarga) {
    const m = new Map<string, number>();
    for (const c of COLUMNAS[tipo]) {
      const col = h.encabezados.get(sinTildes(c.titulo));
      if (col !== undefined) m.set(c.clave, col);
    }
    return m;
  }

  private completa(h: Hoja, tipo: TipoCarga) {
    const m = this.columnas(h, tipo);
    return COLUMNAS[tipo].every((c) => !c.obligatoria || m.has(c.clave));
  }

  /** Valor simple de una celda (fórmulas, texto enriquecido, hipervínculos). */
  private valor(v: unknown): Valor {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v;
    if (typeof v === 'boolean') return v ? 'SI' : 'NO';
    if (typeof v === 'object') {
      const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: unknown; error?: string; sharedFormula?: string };
      if (o.error) return null;
      if (o.richText) return o.richText.map((t) => t.text).join('');
      if ('result' in o || 'formula' in o || o.sharedFormula) return this.valor(o.result);
      if (o.text !== undefined) return this.valor(o.text);
    }
    return String(v);
  }

  static readonly XLSX_MIME = XLSX_MIME;
}
