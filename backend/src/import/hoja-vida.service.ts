import { SettingsService } from '../settings/settings.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { DataSource, EntityManager, In } from 'typeorm';
import { AssetDocument } from '../assets/asset-document.entity';
import { AssetPart } from '../assets/asset-part.entity';
import { Asset } from '../assets/asset.entity';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { ClaseActivo, EstadoActivo, Prioridad, UnidadFrecuencia } from '../common/enums';
import { SparePart } from '../inventory/spare-part.entity';
import { MaintenancePlan, MaintenanceTask } from '../maintenance/maintenance.entities';
import { hoy, MaintenanceService } from '../maintenance/maintenance.service';
import { Frecuencia, HojaVida, leerLibroHojasDeVida, norm, separarTareas } from './hoja-vida';

/** Una hoja de vida trae fotos: se permiten libros más grandes que la plantilla de carga masiva. */
export const MAX_BYTES_HV = 25 * 1024 * 1024;
const NOMBRE_TAREA = 150;

const ESTADOS: Record<string, EstadoActivo> = {
  OPERATIVO: EstadoActivo.OPERATIVO, OPERATIVA: EstadoActivo.OPERATIVO, 'EN FUNCIONAMIENTO': EstadoActivo.OPERATIVO, BUENO: EstadoActivo.OPERATIVO,
  'FUERA DE SERVICIO': EstadoActivo.FUERA_DE_SERVICIO, 'NO OPERATIVO': EstadoActivo.FUERA_DE_SERVICIO, DANADO: EstadoActivo.FUERA_DE_SERVICIO,
  'EN MANTENIMIENTO': EstadoActivo.EN_MANTENIMIENTO,
  'DADO DE BAJA': EstadoActivo.DADO_DE_BAJA, 'DADA DE BAJA': EstadoActivo.DADO_DE_BAJA,
};

const clave = (f: Frecuencia) => `${f.valor}-${f.unidad}`;

/** "trimestral", "cada 2 años", "quincenal"… */
export function periodicidadTexto(f: Frecuencia) {
  if (f.unidad === UnidadFrecuencia.MESES) {
    const fijas: Record<number, string> = { 1: 'mensual', 2: 'bimestral', 3: 'trimestral', 4: 'cuatrimestral', 6: 'semestral', 12: 'anual' };
    if (fijas[f.valor]) return fijas[f.valor];
    return f.valor % 12 === 0 ? `cada ${f.valor / 12} años` : `cada ${f.valor} meses`;
  }
  if (f.unidad === UnidadFrecuencia.SEMANAS) return f.valor === 1 ? 'semanal' : f.valor === 2 ? 'quincenal' : `cada ${f.valor} semanas`;
  return `cada ${f.valor} días`;
}

interface PlanPrevio { clave: string; nombre: string; frecuencia: Frecuencia; periodicidad: string; tareas: string[]; materiales: string | null; existe: boolean }
interface RefPrevia { texto: string; nombre: string; codigo: string | null; cantidad: number | null; enInventario: boolean; descripcion: string | null }

/**
 * Carga de la hoja de vida de maquinaria (formato AC-PMT-FR05, D-34): cada pestaña crea o actualiza una máquina
 * con sus datos técnicos y fotos, convierte las actividades del preventivo en tareas del catálogo y planes por
 * periodicidad (con su primera orden) y arma la lista de materiales con las referencias que traen código.
 * Primero se revisa y se muestra lo que se va a hacer; la carga es todo o nada.
 */
@Injectable()
export class HojaVidaService {
  private readonly dir: string;

  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly maintenance: MaintenanceService,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get('UPLOADS_DIR', './uploads'), 'activos');
  }

  private async leer(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Adjunte el archivo de Excel de la hoja de vida');
    if (file.size > MAX_BYTES_HV) throw new BadRequestException(`El archivo supera ${MAX_BYTES_HV / 1024 / 1024} MB`);
    const zip = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (!zip || !/\.xlsx$/i.test(file.originalname ?? '')) {
      throw new BadRequestException('Solo se aceptan archivos de Excel (.xlsx). Si es un .xls, ábralo en Excel y guárdelo como "Libro de Excel (.xlsx)".');
    }
    let hojas: HojaVida[];
    try {
      hojas = await leerLibroHojasDeVida(file.buffer);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const validas = hojas.filter((h) => !h.errores[0]?.startsWith('No parece'));
    if (!validas.length) throw new BadRequestException('El archivo no tiene ninguna hoja de vida (formato AC-PMT-FR05)');
    return { hojas: validas, omitidas: hojas.filter((h) => !validas.includes(h)).map((h) => h.hoja) };
  }

  /** Revisa el archivo y describe lo que se va a crear o actualizar, sin guardar nada. */
  async analizar(file: Express.Multer.File | undefined) {
    const { hojas, omitidas } = await this.leer(file);
    return this.previa(this.ds.manager, hojas, omitidas);
  }

  private async previa(em: EntityManager, hojas: HojaVida[], omitidas: string[]) {
    const codigos = hojas.map((h) => h.codigo).filter((c): c is string => !!c);
    const existentes = codigos.length ? await em.getRepository(Asset).find({ where: { codigo: In(codigos) } }) : [];
    const porCodigo = new Map(existentes.map((a) => [a.codigo.toUpperCase(), a]));
    const planes = existentes.length ? await em.getRepository(MaintenancePlan).find({ where: { activoId: In(existentes.map((a) => a.id)) } }) : [];
    const refCodigos = [...new Set(hojas.flatMap((h) => h.referencias.map((r) => r.codigo).filter((c): c is string => !!c)))];
    const repuestos = refCodigos.length ? await em.getRepository(SparePart).find({ where: { codigo: In(refCodigos) } }) : [];
    const repPorCodigo = new Map(repuestos.map((r) => [r.codigo.toUpperCase(), r]));
    const tareasExistentes = new Set((await em.getRepository(MaintenanceTask).find()).map((t) => t.nombre.toLowerCase()));
    // D-40: sin inventario, las referencias quedan solo en las notas (no hay repuestos ni listas de materiales).
    const conInventario = await this.settings.moduloActivo('inventario', em);
    const areas: Array<{ area: string }> = await em.query('SELECT DISTINCT area FROM activos');

    const nombreRef = new Map<string, { nombre: string; hoja: string }>();
    const tareasNuevas = new Set<string>();
    const repuestosNuevos = new Map<string, string>();
    const periodicidades = new Map<string, { clave: string; frecuencia: Frecuencia; texto: string }>();
    const vistos = new Set<string>();

    const resultado = hojas.map((h) => {
      const errores = [...h.errores];
      const advertencias = [...h.advertencias];
      if (!h.area) errores.push('No tiene "ÁREA DEL EQUIPO"');
      if (h.codigo && vistos.has(h.codigo)) errores.push(`El código ${h.codigo} está en otra pestaña del mismo archivo`);
      if (h.codigo) vistos.add(h.codigo);
      const existente = h.codigo ? porCodigo.get(h.codigo) : undefined;
      const area = h.area ? areas.find((a) => norm(a.area) === norm(h.area!))?.area ?? h.area : null;
      const estado = h.estado ? ESTADOS[norm(h.estado)] : EstadoActivo.OPERATIVO;
      if (h.estado && !estado) advertencias.push(`El estado "${h.estado}" no se reconoce: queda como Operativo`);
      const equipo = h.nombre ?? 'Equipo';

      const grupos = new Map<string, PlanPrevio>();
      for (const act of h.actividades) {
        if (!act.frecuencia) continue;
        const k = clave(act.frecuencia);
        const texto = periodicidadTexto(act.frecuencia);
        periodicidades.set(k, { clave: k, frecuencia: act.frecuencia, texto });
        const nombrePlan = `Preventivo ${texto}`;
        const g = grupos.get(k) ?? {
          clave: k, nombre: nombrePlan, frecuencia: act.frecuencia, periodicidad: texto, tareas: [], materiales: null,
          existe: !!existente && planes.some((p) => p.activoId === existente.id && p.nombre.toLowerCase() === nombrePlan.toLowerCase()),
        };
        for (const t of separarTareas(act.texto)) {
          const nombre = t.length > NOMBRE_TAREA ? `${t.slice(0, NOMBRE_TAREA - 1)}…` : t;
          if (!g.tareas.includes(nombre)) g.tareas.push(nombre);
          if (!tareasExistentes.has(nombre.toLowerCase())) tareasNuevas.add(nombre.toLowerCase());
        }
        const mats = [g.materiales, act.materiales].filter(Boolean).join(' / ');
        g.materiales = mats || null;
        grupos.set(k, g);
      }
      const planesHoja = [...grupos.values()];
      for (const p of planesHoja) if (p.existe) advertencias.push(`Ya tiene el plan "${p.nombre}": no se crea de nuevo`);

      const referencias: RefPrevia[] = h.referencias.map((r) => {
        let descripcion: string | null = null;
        if (r.codigo) {
          const previo = nombreRef.get(r.codigo);
          if (previo && norm(previo.nombre) !== norm(r.nombre)) {
            advertencias.push(`El código ${r.codigo} aparece aquí como "${r.nombre}" y en la pestaña "${previo.hoja}" como "${previo.nombre}": revise cuál es el correcto (se usará "${previo.nombre}")`);
          }
          if (!previo) nombreRef.set(r.codigo, { nombre: r.nombre, hoja: h.hoja });
          const enInv = repPorCodigo.get(r.codigo);
          descripcion = enInv?.descripcion ?? `${(previo ?? r).nombre} (${equipo})`;
          if (!enInv && conInventario) repuestosNuevos.set(r.codigo, descripcion);
          const almacen = /hay\s+(\d+)\s+en\s+(el\s+)?almac[eé]n/i.exec(r.texto);
          if (almacen && !enInv && conInventario) advertencias.push(`Según la hoja hay ${almacen[1]} de ${r.codigo} en almacén: regístrelas como entrada en Inventario`);
          return { texto: r.texto, nombre: r.nombre, codigo: conInventario ? r.codigo : null, cantidad: r.cantidad, enInventario: !!enInv, descripcion };
        }
        return { texto: r.texto, nombre: r.nombre, codigo: null, cantidad: r.cantidad, enInventario: false, descripcion: null };
      });

      return {
        hoja: h.hoja,
        codigo: h.codigo,
        accion: errores.length ? null : existente ? ('ACTUALIZAR' as const) : ('CREAR' as const),
        datos: {
          nombre: h.nombre, descripcion: h.descripcion, area, ubicacion: h.ubicacion, marca: h.marca, modelo: h.modelo, referencia: h.referencia,
          serie: h.serie, voltaje: h.voltaje, amperaje: h.amperaje, capacidad: h.capacidad, peso: h.peso, adquisicion: h.adquisicion,
          ubicacionManual: h.ubicacionManual, estado: estado ?? EstadoActivo.OPERATIVO,
        },
        fotos: h.fotos.length,
        planes: planesHoja,
        diarias: h.actividades.filter((a) => a.diaria).map((a) => a.texto),
        referencias,
        advertencias,
        errores,
      };
    });
    return {
      hojas: resultado,
      omitidas,
      errores: resultado.reduce((n, h) => n + h.errores.length, 0),
      periodicidades: [...periodicidades.values()].sort((a, b) => a.frecuencia.valor * (a.frecuencia.unidad === 'MESES' ? 30 : a.frecuencia.unidad === 'SEMANAS' ? 7 : 1) - b.frecuencia.valor * (b.frecuencia.unidad === 'MESES' ? 30 : b.frecuencia.unidad === 'SEMANAS' ? 7 : 1)),
      tareasNuevas: tareasNuevas.size,
      repuestosNuevos: [...repuestosNuevos].map(([codigo, descripcion]) => ({ codigo, descripcion })),
      inventario: conInventario,
    };
  }

  /**
   * Carga el archivo. `fechas` dice, por periodicidad, cuándo toca el primer preventivo (AAAA-MM-DD).
   * Con `crearRepuestos`, las referencias con código que no están en inventario se crean (con existencia 0).
   */
  async cargar(file: Express.Multer.File | undefined, fechasJson: string | undefined, crearRepuestos: boolean, actor: SessionUser) {
    const { hojas, omitidas } = await this.leer(file);
    let fechas: Record<string, string> = {};
    try {
      fechas = fechasJson ? JSON.parse(fechasJson) : {};
    } catch {
      throw new BadRequestException('Fechas inválidas');
    }
    const escritos: string[] = [];
    try {
      return await this.ds.transaction(async (em) => {
        const p = await this.previa(em, hojas, omitidas);
        if (p.errores) throw new BadRequestException({ message: `El archivo tiene ${p.errores} error${p.errores === 1 ? '' : 'es'}; no se cargó nada`, hojas: p.hojas });
        const hoyStr = hoy();
        const limite = new Date(Date.parse(`${hoyStr}T00:00:00Z`) + 400 * 86_400_000).toISOString().slice(0, 10);
        for (const per of p.periodicidades) {
          const f = fechas[per.clave];
          if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(f))) throw new BadRequestException(`Indique cuándo toca el primer preventivo ${per.texto}`);
          if (f > limite) throw new BadRequestException(`La fecha del primer preventivo ${per.texto} es demasiado lejana`);
        }

        await mkdir(this.dir, { recursive: true });
        const tareaRepo = em.getRepository(MaintenanceTask);
        const tareas = new Map((await tareaRepo.find()).map((t) => [t.nombre.toLowerCase(), t]));
        const repRepo = em.getRepository(SparePart);
        const resumen = { creadas: 0, actualizadas: 0, fotos: 0, tareasCreadas: 0, repuestosCreados: 0, materiales: 0, planes: [] as Array<{ codigo: string; plan: string; orden: string; fecha: string }> };

        for (const [i, h] of hojas.entries()) {
          const v = p.hojas[i];
          const d = v.datos;
          const notas = [
            d.descripcion ? `Descripción: ${d.descripcion}` : null,
            d.referencia ? `Referencia: ${d.referencia}` : null,
            d.adquisicion ? `Adquisición: ${d.adquisicion}` : null,
            v.diarias.length ? `Rutina diaria del operario (no genera órdenes): ${v.diarias.join(' ')}` : null,
            v.referencias.length ? `Referencias de materiales: ${v.referencias.map((r) => r.texto).join(' · ')}` : null,
            'Cargado de la hoja de vida (AC-PMT-FR05).',
          ].filter(Boolean).join('\n');
          const campos = {
            nombre: d.nombre!, area: d.area!, ubicacion: d.ubicacion, fabricante: d.marca, modelo: d.modelo, serie: d.serie,
            voltaje: d.voltaje?.slice(0, 40) ?? null, amperaje: d.amperaje?.slice(0, 40) ?? null, capacidad: d.capacidad?.slice(0, 60) ?? null,
            peso: d.peso?.slice(0, 40) ?? null, ubicacionManual: d.ubicacionManual?.slice(0, 150) ?? null,
          };
          let activo = await em.getRepository(Asset).findOne({ where: { codigo: h.codigo! } });
          if (activo) {
            const cambios = Object.fromEntries(Object.entries(campos).filter(([, x]) => x !== null && x !== undefined));
            await em.getRepository(Asset).update(activo.id, { ...cambios, ...(activo.notas ? {} : { notas }) });
            resumen.actualizadas++;
          } else {
            activo = await em.getRepository(Asset).save(em.getRepository(Asset).create({
              codigo: h.codigo!, ...campos, clase: ClaseActivo.EQUIPO, estado: d.estado as EstadoActivo, notas,
            }));
            resumen.creadas++;
          }
          await this.audit.log({
            usuarioId: actor.id, accion: v.accion === 'CREAR' ? 'ACTIVO_CREADO' : 'ACTIVO_ACTUALIZADO', entidad: 'activo', entidadId: activo.id,
            detalle: { codigo: activo.codigo, origen: 'hoja de vida', archivo: file?.originalname ?? null },
          }, em);

          // Fotos (no se repiten si se vuelve a cargar el mismo archivo).
          const docs = new Set((await em.getRepository(AssetDocument).find({ where: { activoId: activo.id } })).map((x) => x.nombreOriginal));
          for (const [n, foto] of h.fotos.entries()) {
            const nombre = `Foto ${n + 1} ${activo.codigo}.${foto.ext === 'png' ? 'png' : 'jpg'}`;
            if (docs.has(nombre)) continue;
            const archivo = `${randomUUID()}.${foto.ext === 'png' ? 'png' : 'jpg'}`;
            await writeFile(join(this.dir, archivo), foto.buffer);
            escritos.push(archivo);
            await em.getRepository(AssetDocument).save({ activoId: activo.id, nombreOriginal: nombre, archivo, mime: `image/${foto.ext}`, tamanoBytes: foto.buffer.length, subidoPorId: actor.id });
            resumen.fotos++;
          }

          // Tareas del catálogo y planes por periodicidad.
          for (const plan of v.planes) {
            if (plan.existe) continue;
            const ids: string[] = [];
            for (const nombre of plan.tareas) {
              let t = tareas.get(nombre.toLowerCase());
              if (!t) {
                t = await tareaRepo.save({ nombre, grupo: d.nombre, descripcion: null });
                tareas.set(nombre.toLowerCase(), t);
                resumen.tareasCreadas++;
                await this.audit.log({ usuarioId: actor.id, accion: 'TAREA_CREADA', entidad: 'tarea', entidadId: t.id, detalle: { nombre, origen: 'hoja de vida' } }, em);
              }
              ids.push(t.id);
            }
            const r = await this.maintenance.crearPlanDeMaquinaEn(em, activo, {
              activoId: activo.id, nombre: plan.nombre, tareaIds: ids, tareas: plan.materiales ? `Materiales: ${plan.materiales}` : undefined,
              frecuenciaValor: plan.frecuencia.valor, frecuenciaUnidad: plan.frecuencia.unidad,
              diasAviso: plan.frecuencia.unidad === UnidadFrecuencia.MESES && plan.frecuencia.valor >= 12 ? 15 : 7,
              prioridad: Prioridad.MEDIA, primeraFecha: fechas[plan.clave], repuestos: [],
            }, actor);
            resumen.planes.push({ codigo: activo.codigo, plan: plan.nombre, orden: r.primeraOrden.codigo, fecha: fechas[plan.clave] });
          }

          // Lista de materiales de la máquina con las referencias que tienen código.
          const actuales = new Set((await em.getRepository(AssetPart).find({ where: { activoId: activo.id } })).map((x) => x.repuestoId));
          for (const ref of v.referencias) {
            if (!ref.codigo) continue;
            let rep = await repRepo.findOne({ where: { codigo: ref.codigo } });
            if (!rep) {
              if (!crearRepuestos) continue;
              rep = await repRepo.save(repRepo.create({ codigo: ref.codigo, descripcion: ref.descripcion!.slice(0, 200), unidad: 'UND' }));
              resumen.repuestosCreados++;
              await this.audit.log({ usuarioId: actor.id, accion: 'REPUESTO_CREADO', entidad: 'repuesto', entidadId: rep.id, detalle: { codigo: rep.codigo, origen: 'hoja de vida' } }, em);
            }
            if (!rep.activo || actuales.has(rep.id)) continue;
            await em.getRepository(AssetPart).insert({ activoId: activo.id, repuestoId: rep.id, cantidad: ref.cantidad && ref.cantidad > 0 ? ref.cantidad : 1 });
            actuales.add(rep.id);
            resumen.materiales++;
          }
        }
        return { ...resumen, omitidas };
      });
    } catch (e) {
      // Si la carga no se completó, se borran las fotos que alcanzaron a escribirse.
      await Promise.all(escritos.map((a) => unlink(join(this.dir, a)).catch(() => undefined)));
      throw e;
    }
  }
}
