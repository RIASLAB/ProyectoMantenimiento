import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { posix } from 'path';
import { UnidadFrecuencia } from '../common/enums';

/**
 * Lectura de la hoja de vida de maquinaria de la planta (formato AC-PMT-FR05, D-34).
 * Cada pestaña del libro es una máquina. Los datos se buscan por su rótulo ("MARCA:", "CÓDIGO INVENTARIO:"…),
 * no por la celda, para tolerar pestañas con filas o columnas corridas.
 */

export interface Frecuencia { valor: number; unidad: UnidadFrecuencia }
export interface ActividadHV { texto: string; periodicidad: string; materiales: string | null; frecuencia: Frecuencia | null; diaria: boolean }
export interface ReferenciaHV { texto: string; nombre: string; codigo: string | null; cantidad: number | null }
export interface FotoHV { buffer: Buffer; ext: 'png' | 'jpeg'; fila: number }

export interface HojaVida {
  hoja: string;
  nombre: string | null;
  descripcion: string | null;
  area: string | null;
  ubicacion: string | null;
  codigo: string | null;
  marca: string | null;
  modelo: string | null;
  referencia: string | null;
  serie: string | null;
  voltaje: string | null;
  amperaje: string | null;
  capacidad: string | null;
  peso: string | null;
  adquisicion: string | null;
  ubicacionManual: string | null;
  estado: string | null;
  actividades: ActividadHV[];
  referencias: ReferenciaHV[];
  fotos: FotoHV[];
  advertencias: string[];
  errores: string[];
}

export const MAX_HOJAS_HV = 30;
/** Las fotos de una hoja de vida (en Excel suelen ser capturas grandes): no más de 12 MB cada una. */
const MAX_FOTO = 12 * 1024 * 1024;

/** Mayúsculas sin tildes ni espacios repetidos, para comparar rótulos. */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** "EMPAQUE AL VACIO" → "Empaque al vacio" (los rótulos del formato vienen en mayúsculas). */
export function oracion(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t !== t.toUpperCase()) return t.charAt(0).toUpperCase() + t.slice(1);
  const l = t.toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

const vacio = (s: string | null | undefined) => !s || /^[-–—_.\s]*$/.test(s) || /^n\/?a$/i.test(s.trim());

function textoCelda(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v && v.result !== undefined) return textoCelda(v.result as ExcelJS.CellValue);
    if ('text' in v && typeof v.text === 'string') return v.text;
  }
  return '';
}

interface Celda { fila: number; col: number; texto: string }

/** "Diario", "Trimestral", "2 Años", "Cada 15 días"… → frecuencia del plan. Diario no genera plan (es rutina del operario). */
export function leerPeriodicidad(p: string): { frecuencia: Frecuencia | null; diaria: boolean } {
  const s = norm(p).replace(/^CADA /, '');
  const fijas: Record<string, Frecuencia | 'DIARIA'> = {
    DIARIO: 'DIARIA', DIARIA: 'DIARIA', 'TODOS LOS DIAS': 'DIARIA',
    SEMANAL: { valor: 1, unidad: UnidadFrecuencia.SEMANAS }, QUINCENAL: { valor: 2, unidad: UnidadFrecuencia.SEMANAS },
    MENSUAL: { valor: 1, unidad: UnidadFrecuencia.MESES }, BIMESTRAL: { valor: 2, unidad: UnidadFrecuencia.MESES },
    TRIMESTRAL: { valor: 3, unidad: UnidadFrecuencia.MESES }, CUATRIMESTRAL: { valor: 4, unidad: UnidadFrecuencia.MESES },
    SEMESTRAL: { valor: 6, unidad: UnidadFrecuencia.MESES }, ANUAL: { valor: 12, unidad: UnidadFrecuencia.MESES },
    BIENAL: { valor: 24, unidad: UnidadFrecuencia.MESES },
  };
  const f = fijas[s];
  if (f === 'DIARIA') return { frecuencia: null, diaria: true };
  if (f) return { frecuencia: f, diaria: false };
  const m = /^(\d{1,3}) ?(DIAS?|SEMANAS?|MES(ES)?|ANOS?)$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (n < 1) return { frecuencia: null, diaria: false };
    if (m[2].startsWith('DIA')) return n === 1 ? { frecuencia: null, diaria: true } : { frecuencia: { valor: n, unidad: UnidadFrecuencia.DIAS }, diaria: false };
    if (m[2].startsWith('SEMANA')) return { frecuencia: { valor: n, unidad: UnidadFrecuencia.SEMANAS }, diaria: false };
    if (m[2].startsWith('MES')) return { frecuencia: { valor: n, unidad: UnidadFrecuencia.MESES }, diaria: false };
    return { frecuencia: { valor: n * 12, unidad: UnidadFrecuencia.MESES }, diaria: false };
  }
  return { frecuencia: null, diaria: false };
}

/** "Empaque 3x2: A1074843 Cantida 3 hay 2 en almacen" → nombre, código (si parece uno) y cantidad. */
export function leerReferencia(texto: string): ReferenciaHV {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  const m = /^([^:]{2,80}):\s*(.+)$/.exec(limpio);
  const nombre = (m ? m[1] : limpio).trim();
  const resto = m ? m[2].trim() : '';
  const primera = resto.split(/[\s,;]+/)[0]?.replace(/[.,;]+$/, '') ?? '';
  // Un código lleva al menos una letra o dígito y un dígito, sin espacios: A1074843, 550A10025, OKS370.
  const codigo = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,39}$/.test(primera) && /\d/.test(primera) && !/^\d{1,3}$/.test(primera) ? primera.toUpperCase() : null;
  const c = /cantidad?\s*:?\s*(\d+(?:[.,]\d+)?)/i.exec(resto);
  return { texto: limpio, nombre: oracion(nombre)!, codigo, cantidad: c ? Number(c[1].replace(',', '.')) : null };
}

/** Separa una actividad en tareas: una por oración ("Revisar moldes.Verificar sensores." → dos tareas). */
export function separarTareas(actividad: string): string[] {
  return actividad
    .replace(/\s+/g, ' ')
    .split(/\.(?=\s*[A-ZÁÉÍÓÚÑ¿])|\.\s*$/)
    .map((t) => t.trim().replace(/[.;,\s]+$/, ''))
    .filter((t) => t.length >= 3)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1));
}

function celdas(ws: ExcelJS.Worksheet): Celda[] {
  const out: Celda[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged && cell.master !== cell) return; // la combinada se lee una vez
      const t = textoCelda(cell.value).replace(/\s+/g, ' ').trim();
      if (t) out.push({ fila: row.number, col: Number(cell.col), texto: t });
    });
  });
  return out;
}

interface ImagenHoja { buffer: Buffer; extension: string; fila: number }

const destino = (base: string, target: string) => (target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(base, target)));
const relaciones = async (zip: JSZip, archivo: string) => {
  const rels = zip.file(posix.join(posix.dirname(archivo), '_rels', `${posix.basename(archivo)}.rels`));
  const out = new Map<string, string>();
  if (!rels) return out;
  for (const m of (await rels.async('string')).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) out.set(id, destino(posix.dirname(archivo), target));
  }
  return out;
};

/**
 * Plan B para libros que no guardó Excel (otros programas escriben los dibujos de otra forma y el lector completo
 * falla): se sacan las fotos leyendo el ZIP directamente y se quitan los dibujos para leer las celdas.
 */
async function sinDibujos(buffer: Buffer): Promise<{ limpio: Buffer; imagenes: Map<string, ImagenHoja[]> }> {
  const zip = await JSZip.loadAsync(buffer);
  const imagenes = new Map<string, ImagenHoja[]>();
  const libro = await zip.file('xl/workbook.xml')?.async('string');
  if (!libro) throw new Error('sin libro');
  const relsLibro = await relaciones(zip, 'xl/workbook.xml');
  for (const m of libro.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const nombre = /\bname="([^"]+)"/.exec(m[0])?.[1]?.replace(/&amp;/g, '&');
    const rid = /\b\w+:id="([^"]+)"/.exec(m[0])?.[1];
    const hoja = rid ? relsLibro.get(rid) : undefined;
    if (!nombre || !hoja || !zip.file(hoja)) continue;
    const relsHoja = await relaciones(zip, hoja);
    let xml = await zip.file(hoja)!.async('string');
    for (const d of xml.matchAll(/<(?:\w+:)?drawing\b[^>]*\b\w+:id="([^"]+)"[^>]*\/>/g)) {
      const dibujo = relsHoja.get(d[1]);
      if (!dibujo || !zip.file(dibujo)) continue;
      const relsDibujo = await relaciones(zip, dibujo);
      const dxml = await zip.file(dibujo)!.async('string');
      const lista: ImagenHoja[] = [];
      for (const a of dxml.matchAll(/<(?:\w+:)?(?:one|two)CellAnchor\b[\s\S]*?<\/(?:\w+:)?(?:one|two)CellAnchor>/g)) {
        const fila = Number(/<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)</.exec(a[0])?.[1] ?? 0);
        const emb = /\b\w+:embed="([^"]+)"/.exec(a[0])?.[1];
        const media = emb ? relsDibujo.get(emb) : undefined;
        if (!media || !zip.file(media)) continue;
        lista.push({ buffer: await zip.file(media)!.async('nodebuffer'), extension: posix.extname(media).slice(1).toLowerCase(), fila });
      }
      imagenes.set(nombre, [...(imagenes.get(nombre) ?? []), ...lista]);
    }
    xml = xml.replace(/<(?:\w+:)?(?:legacyDrawing|drawing)\b[^>]*\/>/g, '');
    zip.file(hoja, xml);
  }
  for (const n of Object.keys(zip.files)) if (/^xl\/drawings\//.test(n)) zip.remove(n);
  return { limpio: await zip.generateAsync({ type: 'nodebuffer' }), imagenes };
}

/** Lee el libro completo (con fotos). Lanza un Error con mensaje para el usuario si no se puede abrir. */
export async function leerLibroHojasDeVida(buffer: Buffer): Promise<HojaVida[]> {
  let wb = new ExcelJS.Workbook();
  let imagenes: Map<string, ImagenHoja[]> | null = null;
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    try {
      const r = await sinDibujos(buffer);
      imagenes = r.imagenes;
      wb = new ExcelJS.Workbook();
      await wb.xlsx.load(r.limpio as unknown as ArrayBuffer);
    } catch {
      throw new Error('No se pudo abrir el archivo. Ábralo en Excel, guárdelo de nuevo como .xlsx e intente otra vez.');
    }
  }
  const hojas: HojaVida[] = [];
  for (const ws of wb.worksheets.slice(0, MAX_HOJAS_HV)) {
    if (ws.state !== 'visible') continue;
    const fotos: ImagenHoja[] = imagenes
      ? imagenes.get(ws.name) ?? []
      : ws.getImages().flatMap((img) => {
        const media = wb.getImage(Number(img.imageId)) as unknown as { buffer?: Buffer; extension?: string };
        return media?.buffer ? [{ buffer: Buffer.from(media.buffer), extension: media.extension ?? '', fila: img.range.tl.nativeRow }] : [];
      });
    hojas.push(leerHoja(ws, fotos));
  }
  return hojas;
}

function leerHoja(ws: ExcelJS.Worksheet, imagenes: ImagenHoja[]): HojaVida {
  const cs = celdas(ws);
  const h: HojaVida = {
    hoja: ws.name, nombre: null, descripcion: null, area: null, ubicacion: null, codigo: null, marca: null, modelo: null, referencia: null,
    serie: null, voltaje: null, amperaje: null, capacidad: null, peso: null, adquisicion: null, ubicacionManual: null, estado: null,
    actividades: [], referencias: [], fotos: [], advertencias: [], errores: [],
  };
  if (!cs.some((c) => norm(c.texto).includes('HOJA DE VIDA'))) {
    h.errores.push('No parece una hoja de vida (no tiene el título "HOJA DE VIDA DE MAQUINARIA Y EQUIPOS")');
    return h;
  }
  // La celda de la derecha, si no es otro rótulo ("MARCA: …").
  const derecha = (c: Celda) => {
    const t = cs.filter((x) => x.fila === c.fila && x.col > c.col).sort((a, b) => a.col - b.col)[0]?.texto ?? null;
    return t && !t.includes(':') ? t : null;
  };
  /** Valor de un rótulo: lo que sigue a los dos puntos en la misma celda o, si está vacío, la celda de la derecha. */
  const campo = (...rotulos: string[]): string | null => {
    for (const c of cs) {
      const n = norm(c.texto);
      for (const r of rotulos) {
        if (!n.startsWith(r)) continue;
        const resto = c.texto.slice(c.texto.indexOf(':') + 1).trim();
        const v = c.texto.includes(':') && resto ? resto : derecha(c);
        return vacio(v) ? null : v!.replace(/\s+/g, ' ').trim();
      }
    }
    return null;
  };
  h.nombre = oracion(campo('NOMBRE DEL EQUIPO', 'NOMBRE DE LA MAQUINA', 'NOMBRE:'));
  h.descripcion = oracion(campo('DESCRIPCION:', 'DESCRIPCION DEL EQUIPO'));
  h.area = oracion(campo('AREA DEL EQUIPO', 'AREA:'));
  h.ubicacion = oracion(campo('UBICACION:'));
  h.codigo = campo('CODIGO INVENTARIO', 'CODIGO DE INVENTARIO', 'CODIGO DEL EQUIPO')?.toUpperCase().replace(/\s+/g, '') ?? null;
  h.marca = campo('MARCA');
  h.modelo = campo('MODELO');
  h.referencia = campo('REFERENCIA:', 'REFERENCIA DEL EQUIPO');
  h.serie = campo('N° DE SERIE', 'Nº DE SERIE', 'NO DE SERIE', 'N DE SERIE', 'SERIE');
  h.voltaje = campo('VOLTAJE');
  h.amperaje = campo('AMPERAJE');
  h.capacidad = campo('CAPACIDAD');
  h.peso = campo('PESO');
  h.adquisicion = campo('FECHA DE ADQUISICION', 'FECHA DE COMPRA');
  h.ubicacionManual = oracion(campo('UBICACION DEL MANUAL'));
  h.estado = campo('ESTADO DEL EQUIPO');
  for (const k of ['marca', 'modelo', 'serie'] as const) if (h[k]) h[k] = h[k]!.trim();

  if (!h.codigo) h.errores.push('No tiene "CÓDIGO INVENTARIO": es el código con que se identifica la máquina en el sistema');
  else if (!/^[A-Z0-9._/-]{2,40}$/.test(h.codigo)) h.errores.push(`El código "${h.codigo}" no es válido (letras, números, guion o punto; máximo 40)`);
  if (!h.nombre) h.errores.push('No tiene "NOMBRE DEL EQUIPO O MAQUINARIA"');

  // Actividades del preventivo: filas bajo el encabezado ACTIVIDAD / PERIODICIDAD / MATERIALES.
  const encab = cs.find((c) => norm(c.texto) === 'ACTIVIDAD' || norm(c.texto) === 'ACTIVIDADES');
  const fin = cs.find((c) => norm(c.texto).startsWith('REFERENCIAS DE MATERIALES'))?.fila
    ?? cs.find((c) => norm(c.texto).startsWith('REGISTRO FOTOGRAFICO'))?.fila ?? Infinity;
  if (encab) {
    const colPer = cs.find((c) => c.fila === encab.fila && norm(c.texto).startsWith('PERIODICIDAD'))?.col;
    const colMat = cs.find((c) => c.fila === encab.fila && norm(c.texto).startsWith('MATERIALES'))?.col;
    const filas = [...new Set(cs.filter((c) => c.fila > encab.fila && c.fila < fin).map((c) => c.fila))].sort((a, b) => a - b);
    for (const f of filas) {
      const enFila = cs.filter((c) => c.fila === f);
      const texto = enFila.find((c) => c.col === encab.col)?.texto ?? enFila.find((c) => c.col < (colPer ?? Infinity))?.texto;
      if (!texto) continue;
      const periodicidad = colPer ? enFila.find((c) => c.col === colPer)?.texto ?? '' : '';
      const materiales = colMat ? enFila.find((c) => c.col === colMat)?.texto ?? null : null;
      const p = leerPeriodicidad(periodicidad);
      if (!p.frecuencia && !p.diaria) {
        h.advertencias.push(periodicidad
          ? `La periodicidad "${periodicidad}" de la fila ${f} no se entiende: esa actividad no se cargará como preventivo`
          : `La actividad de la fila ${f} no tiene periodicidad: no se cargará como preventivo`);
      }
      h.actividades.push({ texto, periodicidad, materiales, ...p });
    }
  } else {
    h.advertencias.push('No se encontró la tabla de mantenimiento preventivo (ACTIVIDAD / PERIODICIDAD)');
  }

  // Referencias de materiales: cada celda con texto entre el rótulo y el registro fotográfico.
  const ref = cs.find((c) => norm(c.texto).startsWith('REFERENCIAS DE MATERIALES'));
  const foto = cs.find((c) => norm(c.texto).startsWith('REGISTRO FOTOGRAFICO'))?.fila ?? Infinity;
  if (ref) {
    for (const c of cs.filter((x) => x.fila > ref.fila && x.fila < foto).sort((a, b) => a.fila - b.fila || a.col - b.col)) h.referencias.push(leerReferencia(c.texto));
  }

  // Fotos: las imágenes del libro menos el logo del encabezado.
  for (const img of imagenes) {
    const fila = img.fila + 1;
    if (fila <= 5) continue;
    const ext = img.extension === 'png' ? 'png' : img.extension === 'jpeg' || img.extension === 'jpg' ? 'jpeg' : null;
    if (!ext) { h.advertencias.push(`Una imagen en formato ${img.extension || 'desconocido'} no se pudo cargar (solo JPG o PNG)`); continue; }
    if (img.buffer.length > MAX_FOTO) { h.advertencias.push('Una foto supera 12 MB y no se cargó'); continue; }
    h.fotos.push({ buffer: img.buffer, ext, fila });
  }
  h.fotos.sort((a, b) => a.fila - b.fila);
  return h;
}
