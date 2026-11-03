import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { SettingsService } from '../settings/settings.service';
import { CreatePointDto, CreateSurveyDto, RoomTypeDto, UpdatePointDto } from './lighting.dto';
import { LightingPoint, LightingReading, LightingRoomType, LightingSurvey } from './lighting.entities';

const redondear1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Medición de iluminación (formato AC-PMT-MI01): en cada punto se toman 3 mediciones en lux; cumple si la media
 * alcanza el mínimo de referencia de su tipo de recinto (D-23). Un punto que no cumple exige plan de acción.
 */
@Injectable()
export class LightingService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ---------- Tipos de recinto ----------

  recintos() {
    return this.ds.getRepository(LightingRoomType).find({ order: { nombre: 'ASC' } });
  }

  async crearRecinto(dto: RoomTypeDto, actor: SessionUser) {
    this.validarNiveles(dto);
    const repo = this.ds.getRepository(LightingRoomType);
    if (await repo.createQueryBuilder('r').where('lower(r.nombre) = lower(:n)', { n: dto.nombre.trim() }).getExists()) {
      throw new ConflictException('Ya existe un tipo de recinto con ese nombre');
    }
    return this.ds.transaction(async (em) => {
      const r = await em.getRepository(LightingRoomType).save({ ...dto, nombre: dto.nombre.trim() });
      await this.audit.log({ usuarioId: actor.id, accion: 'RECINTO_ILUMINACION_CREADO', entidad: 'iluminacion', entidadId: r.id, detalle: { ...dto } }, em);
      return r;
    });
  }

  async actualizarRecinto(id: string, dto: RoomTypeDto, actor: SessionUser) {
    this.validarNiveles(dto);
    const repo = this.ds.getRepository(LightingRoomType);
    const r = await repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Tipo de recinto no encontrado');
    await this.ds.transaction(async (em) => {
      await em.getRepository(LightingRoomType).update(id, { ...dto, nombre: dto.nombre.trim() });
      // Cambiar un valor de referencia es sensible: las mediciones anteriores conservan el que tenían.
      await this.audit.log({
        usuarioId: actor.id, accion: 'RECINTO_ILUMINACION_ACTUALIZADO', entidad: 'iluminacion', entidadId: id,
        detalle: { antes: { nombre: r.nombre, minimo: r.minimo, promedio: r.promedio, maximo: r.maximo }, despues: { ...dto } },
      }, em);
    });
    return repo.findOneOrFail({ where: { id } });
  }

  // ---------- Puntos ----------

  puntos(incluirInactivos = false) {
    return this.ds.getRepository(LightingPoint).find({
      where: incluirInactivos ? {} : { vigente: true }, relations: { recinto: true }, order: { orden: 'ASC', nombre: 'ASC' },
    });
  }

  async crearPunto(dto: CreatePointDto, actor: SessionUser) {
    if (!(await this.ds.getRepository(LightingRoomType).exists({ where: { id: dto.recintoId } }))) throw new NotFoundException('Tipo de recinto no encontrado');
    return this.ds.transaction(async (em) => {
      const [{ max }] = await em.query('SELECT coalesce(max(orden), 0) AS max FROM puntos_iluminacion');
      const p = await em.getRepository(LightingPoint).save({ nombre: dto.nombre.trim(), recintoId: dto.recintoId, orden: Number(max) + 1 });
      await this.audit.log({ usuarioId: actor.id, accion: 'PUNTO_ILUMINACION_CREADO', entidad: 'iluminacion', entidadId: p.id, detalle: { nombre: p.nombre } }, em);
      return p;
    });
  }

  async actualizarPunto(id: string, dto: UpdatePointDto, actor: SessionUser) {
    const repo = this.ds.getRepository(LightingPoint);
    const p = await repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Punto no encontrado');
    if (dto.recintoId && !(await this.ds.getRepository(LightingRoomType).exists({ where: { id: dto.recintoId } }))) throw new NotFoundException('Tipo de recinto no encontrado');
    const cambios: Partial<LightingPoint> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
    if (dto.recintoId !== undefined) cambios.recintoId = dto.recintoId;
    if (dto.orden !== undefined) cambios.orden = dto.orden;
    if (dto.vigente !== undefined) cambios.vigente = dto.vigente;
    await this.ds.transaction(async (em) => {
      await em.getRepository(LightingPoint).update(id, cambios);
      await this.audit.log({ usuarioId: actor.id, accion: 'PUNTO_ILUMINACION_ACTUALIZADO', entidad: 'iluminacion', entidadId: id, detalle: { nombre: p.nombre, ...cambios } }, em);
    });
    return repo.findOneOrFail({ where: { id }, relations: { recinto: true } });
  }

  // ---------- Mediciones ----------

  async mediciones() {
    return this.ds.getRepository(LightingSurvey).createQueryBuilder('m')
      .leftJoin('m.usuario', 'u').addSelect(['u.id', 'u.nombre'])
      .orderBy('m.fecha', 'DESC').addOrderBy('m.creadoEn', 'DESC')
      .limit(200).getMany();
  }

  async medicion(id: string) {
    const m = await this.ds.getRepository(LightingSurvey).createQueryBuilder('m')
      .leftJoin('m.usuario', 'u').addSelect(['u.id', 'u.nombre'])
      .leftJoinAndSelect('m.lecturas', 'l')
      .where('m.id = :id', { id })
      .orderBy('l.orden', 'ASC')
      .getOne();
    if (!m) throw new NotFoundException('Medición no encontrada');
    return { ...m, formato: await this.settings.getFormato('ILUMINACION') };
  }

  async registrar(dto: CreateSurveyDto, actor: SessionUser) {
    const ids = dto.lecturas.map((l) => l.puntoId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay un punto repetido en la medición');
    const puntos = await this.ds.getRepository(LightingPoint).find({ where: { id: In(ids) }, relations: { recinto: true } });
    if (puntos.length !== ids.length) throw new BadRequestException('Un punto de la medición no existe');
    const porId = new Map(puntos.map((p) => [p.id, p]));

    const lecturas = dto.lecturas.map((l) => {
      const p = porId.get(l.puntoId)!;
      const media = redondear1((l.medicion1 + l.medicion2 + l.medicion3) / 3);
      const cumple = media >= p.recinto.minimo;
      const planAccion = l.planAccion?.trim() || null;
      if (!cumple && (!planAccion || planAccion.length < 5)) {
        throw new BadRequestException(`${p.nombre}: la media (${media} lux) está por debajo del mínimo (${p.recinto.minimo} lux). Escriba el plan de acción.`);
      }
      return {
        orden: p.orden, puntoNombre: p.nombre, recintoNombre: p.recinto.nombre,
        refMinimo: p.recinto.minimo, refPromedio: p.recinto.promedio, refMaximo: p.recinto.maximo,
        medicion1: l.medicion1, medicion2: l.medicion2, medicion3: l.medicion3, media, cumple,
        planAccion, observaciones: l.observaciones?.trim() || null,
      };
    }).sort((a, b) => a.orden - b.orden);
    const noCumplen = lecturas.filter((l) => !l.cumple).length;

    return this.ds.transaction(async (em) => {
      const m = await em.getRepository(LightingSurvey).save({
        fecha: dto.fecha.slice(0, 10), empresa: dto.empresa, lugar: dto.lugar.trim(), evaluador: dto.evaluador.trim(), cargoEvaluador: dto.cargoEvaluador.trim(),
        observaciones: dto.observaciones?.trim() || null, puntosCumplen: lecturas.length - noCumplen, puntosNoCumplen: noCumplen, usuarioId: actor.id,
      });
      await em.getRepository(LightingReading).save(lecturas.map((l, i) => ({ ...l, orden: i + 1, medicionId: m.id })));
      await this.audit.log({
        usuarioId: actor.id, accion: 'MEDICION_ILUMINACION_REGISTRADA', entidad: 'iluminacion', entidadId: m.id,
        detalle: { fecha: m.fecha, lugar: m.lugar, puntos: lecturas.length, noCumplen },
      }, em);
      return { id: m.id, puntosCumplen: m.puntosCumplen, puntosNoCumplen: m.puntosNoCumplen };
    });
  }

  private validarNiveles(d: { minimo: number; promedio: number; maximo: number }) {
    if (!(d.minimo <= d.promedio && d.promedio <= d.maximo)) throw new BadRequestException('Los niveles deben ir de menor a mayor: mínimo ≤ promedio ≤ máximo');
  }
}
