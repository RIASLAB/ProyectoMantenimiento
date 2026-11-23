import { randomUUID } from 'crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';

/** Hora local a partir de la cual se avisa que falta el preoperatorio diario. */
export const HORA_RECORDAR_DIARIA = 9;
import { Asset } from '../../assets/asset.entity';
import { AuditLog } from '../../audit/audit-log.entity';
import { ClaseActivo } from '../../common/enums';
import { LightingPoint, LightingRoomType } from '../../lighting/lighting.entities';
import { ChecklistTemplate, ControlPoint } from '../../quality/quality.entities';
import { plantasDe } from '../../quality/quality.service';
import { FORMATOS_POR_DEFECTO, FormatoDocumental, PARAM_FORMATOS, Setting } from '../../settings/setting.entity';
import { HOJAS_DIARIAS, ILUMINACION, PlantillaFormato, PREOPERACIONALES, TABLEROS_ELECTRICOS, TEMPERATURAS } from './datos-formatos';

/**
 * Rango de temperatura de un cuarto según su nombre (D-22; rangos actualizados por calidad en D-42):
 * refrigeración −8 a 4 °C; conservación −24 a −14 °C; subproducto y muelles −4 a 6 °C; salas, marinado y pasillos
 * 4 a 10 °C; cuarto de cabezas y pezuñas −8 a 6 °C; frizado −25 a −10 °C; túneles sin rango (se registran, D-46).
 * Los que calidad no ha cambiado siguen
 * con los de los formatos: IQF y congelación rápida −24 a −18; congelación −18 a −10; canales −5 a 4;
 * devoluciones −2 a 6; producto terminado, maduración, precámara y cavas −4 a 4. Alistamiento, procesos, fileteado,
 * áreas y empaque secundario, sin límites.
 */
export function rangoCuarto(nombre: string): { minimo: number | null; maximo: number | null } {
  const n = normalizar(nombre);
  if (/TUNEL/.test(n)) return { minimo: null, maximo: null };
  if (/CABEZA/.test(n)) return { minimo: -8, maximo: 6 };
  if (/SUBPRODUCTO|^MUELLE\b/.test(n)) return { minimo: -4, maximo: 6 };
  if (/^(SALA|PASILLO|PASSILLO)\b|MARINADO/.test(n)) return { minimo: 4, maximo: 10 };
  if (/^AREA\b|\bEMPAQUE SECUNDARIO\b|\bALISTAMIENTO\b|^PROCESOS\b|\bFILETEADO\b/.test(n)) return { minimo: null, maximo: null };
  if (/FRISS|FRIZZ|FRIZADO|FRIZ\b/.test(n)) return { minimo: -25, maximo: -10 };
  if (/CONSERVACION/.test(n)) return { minimo: -24, maximo: -14 };
  if (/IQF|CONGELACION RAPIDA/.test(n)) return { minimo: -24, maximo: -18 };
  if (/CONTENEDOR|CONGELACION|CONGELADO/.test(n)) return { minimo: -18, maximo: -10 };
  if (/CANAL/.test(n)) return { minimo: -5, maximo: 4 };
  if (/DEVOLUC/.test(n)) return { minimo: -2, maximo: 6 };
  if (/REFRIGERACION/.test(n)) return { minimo: -8, maximo: 4 };
  if (/MADURACION|PRODUCTO TERMINADO|PRECAMARA|CAVA/.test(n)) return { minimo: -4, maximo: 4 };
  return { minimo: null, maximo: null };
}

const normalizar = (nombre: string) => nombre.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const PREFIJO_PLANTA: Record<string, string> = { 'Planta Pollo': 'POL', 'Planta Desposte': 'DES', 'Planta Salsamentaria': 'SAL' };

export interface ResumenCarga {
  plantillas: number;
  instalaciones: number;
  puntosTemperatura: number;
  recintos: number;
  puntosIluminacion: number;
  formatos: number;
}

/**
 * Carga en el sistema los formatos de los archivos de la planta: preoperacionales, hojas diarias, revisión de tableros,
 * cuartos fríos con sus puntos de temperatura y la medición de iluminación. Se puede correr varias veces:
 * lo que ya existe (mismo nombre o código) no se toca, para no pisar cambios hechos en la aplicación.
 */
export async function cargarFormatos(ds: DataSource, usuarioId: string | null = null): Promise<ResumenCarga> {
  return ds.transaction(async (em) => {
    const r: ResumenCarga = { plantillas: 0, instalaciones: 0, puntosTemperatura: 0, recintos: 0, puntosIluminacion: 0, formatos: 0 };

    // Checklists (preoperacionales, hojas diarias y tableros).
    // Los preoperacionales por máquina se llenan una vez por semana por equipo (D-43).
    for (const f of PREOPERACIONALES) if (await crearPlantilla(em, f, true)) r.plantillas++;
    for (const f of [...HOJAS_DIARIAS, TABLEROS_ELECTRICOS]) if (await crearPlantilla(em, f)) r.plantillas++;
    // Las hojas diarias de cada planta avisan a las 9 a. m. si no se han llenado (solo si nadie configuró otra hora).
    for (const f of HOJAS_DIARIAS) {
      await em.getRepository(ChecklistTemplate).update({ nombre: f.nombre, recordarHora: IsNull() }, { recordarHora: HORA_RECORDAR_DIARIA });
    }

    // Cuartos fríos y áreas: cada uno es una instalación con su punto de temperatura cada 3 horas.
    const formatos = await leerFormatos(em);
    for (const t of TEMPERATURAS) {
      const prefijo = PREFIJO_PLANTA[t.planta] ?? t.planta.replace(/\W/g, '').slice(0, 3).toUpperCase();
      for (const [i, cuarto] of t.cuartos.entries()) {
        const codigo = `CF-${prefijo}-${String(i + 1).padStart(2, '0')}`;
        let a = await em.getRepository(Asset).findOne({ where: { codigo } });
        if (!a) {
          a = await em.getRepository(Asset).save(em.getRepository(Asset).create({
            codigo, nombre: cuarto, area: t.planta, planta: t.planta, ubicacion: cuarto, clase: ClaseActivo.INSTALACION,
            notas: 'Cuarto frío o área con registro de temperatura (cargado de los formatos de la planta).',
          }));
          r.instalaciones++;
        }
        if (!(await em.getRepository(ControlPoint).exists({ where: { activoId: a.id } }))) {
          await em.getRepository(ControlPoint).save({ activoId: a.id, nombre: 'Temperatura del cuarto', ...rangoCuarto(cuarto), frecuenciaHoras: 3 });
          r.puntosTemperatura++;
        }
      }
      const clave = `TEMPERATURA:${t.planta}`;
      if (!formatos[clave]) {
        formatos[clave] = {
          nombre: `Registro de temperatura de cuartos fríos y áreas · ${t.planta}`, codigo: t.codigo, version: t.version,
          fechaElaboracion: t.fechaElaboracion, fechaActualizacion: t.fechaActualizacion,
        };
        r.formatos++;
      }
    }
    if (r.formatos) await em.getRepository(Setting).save({ clave: PARAM_FORMATOS, valor: JSON.stringify(formatos) });

    // Iluminación.
    const recintos = new Map<string, LightingRoomType>();
    for (const x of ILUMINACION.recintos) {
      let rec = await em.getRepository(LightingRoomType).findOne({ where: { nombre: x.nombre } });
      if (!rec) {
        rec = await em.getRepository(LightingRoomType).save(x);
        r.recintos++;
      }
      recintos.set(x.nombre, rec);
    }
    for (const [i, p] of ILUMINACION.puntos.entries()) {
      const rec = recintos.get(p.recinto);
      if (!rec || (await em.getRepository(LightingPoint).exists({ where: { nombre: p.nombre } }))) continue;
      await em.getRepository(LightingPoint).save({ nombre: p.nombre, recintoId: rec.id, orden: i + 1 });
      r.puntosIluminacion++;
    }

    await em.getRepository(AuditLog).save({ usuarioId, accion: 'FORMATOS_CARGADOS', entidad: 'parametro', entidadId: PARAM_FORMATOS, detalle: { ...r } });
    return r;
  });
}

async function crearPlantilla(em: EntityManager, f: PlantillaFormato, semanal = false) {
  if (await em.getRepository(ChecklistTemplate).exists({ where: { nombre: f.nombre } })) return false;
  await em.getRepository(ChecklistTemplate).save({
    semanal, nombre: f.nombre, ...plantasDe({ plantas: f.plantas, area: f.area }), descripcion: f.descripcion, recomendacion: f.recomendacion,
    codigo: f.codigo, version: f.version, fechaElaboracion: f.fechaElaboracion, fechaActualizacion: f.fechaActualizacion,
    items: f.items.map((it) => ({ ...it, id: randomUUID().slice(0, 8) })),
  } as never);
  return true;
}

async function leerFormatos(em: EntityManager): Promise<Record<string, FormatoDocumental>> {
  const s = await em.getRepository(Setting).findOne({ where: { clave: PARAM_FORMATOS } });
  try {
    return s?.valor ? JSON.parse(s.valor) : { ...FORMATOS_POR_DEFECTO };
  } catch {
    return { ...FORMATOS_POR_DEFECTO };
  }
}
