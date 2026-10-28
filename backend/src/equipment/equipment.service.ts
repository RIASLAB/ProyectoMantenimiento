import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, ILike, In } from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { SparePart } from '../inventory/spare-part.entity';
import { MaintenancePlan } from '../maintenance/maintenance.entities';
import { CreateModelDto, ResumenQuery, UpdateModelDto } from './equipment.dto';
import { EquipmentCategory, EquipmentModel, EquipmentModelPart } from './equipment.entities';

const limpio = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Tipos de equipo: categorías, modelos y su lista de materiales; conteo de equipos por tipo y área. */
@Injectable()
export class EquipmentService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Modelos con su categoría, lista de materiales y cantidad de equipos. */
  async listModelos() {
    const modelos = await this.ds.getRepository(EquipmentModel)
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.categoria', 'c')
      .leftJoinAndSelect('m.materiales', 'mm')
      .leftJoin('mm.repuesto', 'r').addSelect(['r.id', 'r.codigo', 'r.descripcion', 'r.unidad'])
      .orderBy('c.nombre').addOrderBy('m.nombre').addOrderBy('r.codigo')
      .getMany();
    const conteo = await this.conteoEquipos();
    return modelos.map((m) => ({ ...m, equipos: conteo.get(m.id) ?? 0 }));
  }

  async getModelo(id: string) {
    const m = await this.ds.getRepository(EquipmentModel)
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.categoria', 'c')
      .leftJoinAndSelect('m.materiales', 'mm')
      .leftJoin('mm.repuesto', 'r').addSelect(['r.id', 'r.codigo', 'r.descripcion', 'r.unidad'])
      .where('m.id = :id', { id })
      .orderBy('r.codigo')
      .getOne();
    if (!m) throw new NotFoundException('Tipo de equipo no encontrado');
    const equipos = await this.ds.getRepository(Asset).find({ where: { modeloId: id }, select: { id: true, codigo: true, nombre: true, area: true, estado: true }, order: { codigo: 'ASC' } });
    return { ...m, equipos };
  }

  /** Categorías que tienen al menos un modelo (para filtros y sugerencias). */
  async listCategorias() {
    const rows: Array<{ id: string; nombre: string; modelos: string }> = await this.ds.query(
      `SELECT c.id, c.nombre, count(m.id) AS modelos FROM categorias_equipo c JOIN modelos_equipo m ON m.categoria_id = c.id GROUP BY c.id ORDER BY c.nombre`,
    );
    return rows.map((r) => ({ id: r.id, nombre: r.nombre, modelos: Number(r.modelos) }));
  }

  async crearModelo(dto: CreateModelDto, actor: SessionUser) {
    const nombre = limpio(dto.nombre);
    return this.ds.transaction(async (em) => {
      await this.exigirNombreLibre(em, nombre);
      const categoria = await this.categoria(em, dto.categoria);
      const materiales = await this.materiales(em, dto.materiales);
      const m = await em.getRepository(EquipmentModel).save(em.getRepository(EquipmentModel).create({
        categoriaId: categoria.id, nombre,
        fabricante: limpio(dto.fabricante) || null, referencia: limpio(dto.referencia) || null, descripcion: dto.descripcion?.trim() || null,
        materiales: materiales.map((x) => em.getRepository(EquipmentModelPart).create(x)),
      }));
      await this.audit.log({ usuarioId: actor.id, accion: 'MODELO_CREADO', entidad: 'modelo', entidadId: m.id, detalle: { categoria: categoria.nombre, nombre, materiales: materiales.length } }, em);
      return { id: m.id };
    });
  }

  async actualizarModelo(id: string, dto: UpdateModelDto, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const m = await em.getRepository(EquipmentModel).findOne({ where: { id } });
      if (!m) throw new NotFoundException('Tipo de equipo no encontrado');
      const cambios: Partial<EquipmentModel> = {};
      if (dto.nombre !== undefined && limpio(dto.nombre) !== m.nombre) {
        cambios.nombre = limpio(dto.nombre);
        await this.exigirNombreLibre(em, cambios.nombre, id);
      }
      if (dto.categoria !== undefined) cambios.categoriaId = (await this.categoria(em, dto.categoria)).id;
      if (dto.fabricante !== undefined) cambios.fabricante = limpio(dto.fabricante) || null;
      if (dto.referencia !== undefined) cambios.referencia = limpio(dto.referencia) || null;
      if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion?.trim() || null;
      if (Object.keys(cambios).length) await em.getRepository(EquipmentModel).update(id, cambios);
      if (dto.materiales) {
        const materiales = await this.materiales(em, dto.materiales);
        await em.getRepository(EquipmentModelPart).delete({ modeloId: id });
        if (materiales.length) await em.getRepository(EquipmentModelPart).insert(materiales.map((x) => ({ ...x, modeloId: id })));
      }
      await this.audit.log({ usuarioId: actor.id, accion: 'MODELO_ACTUALIZADO', entidad: 'modelo', entidadId: id, detalle: { ...cambios, materiales: dto.materiales ? dto.materiales.length : undefined } as Record<string, unknown> }, em);
      await this.limpiarCategorias(em);
      return { ok: true };
    });
  }

  /** Solo si ningún equipo ni plan lo usa. */
  async eliminarModelo(id: string, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const m = await em.getRepository(EquipmentModel).findOne({ where: { id } });
      if (!m) throw new NotFoundException('Tipo de equipo no encontrado');
      const equipos = await em.getRepository(Asset).count({ where: { modeloId: id } });
      if (equipos) throw new ConflictException(`No se puede eliminar: ${equipos} equipo${equipos === 1 ? '' : 's'} tiene${equipos === 1 ? '' : 'n'} este tipo`);
      if (await em.getRepository(MaintenancePlan).exists({ where: { modeloId: id } })) throw new ConflictException('No se puede eliminar: tiene un plan preventivo por tipo');
      await em.getRepository(EquipmentModel).delete(id);
      await this.audit.log({ usuarioId: actor.id, accion: 'MODELO_ELIMINADO', entidad: 'modelo', entidadId: id, detalle: { nombre: m.nombre } }, em);
      await this.limpiarCategorias(em);
      return { ok: true };
    });
  }

  /**
   * Cuántos equipos hay de cada tipo en cada área (ej. aires acondicionados en Bodega), con su estado.
   * Los equipos sin tipo asignado aparecen como "Sin tipo".
   */
  async resumen(q: ResumenQuery) {
    const params: unknown[] = [];
    const filtros: string[] = [];
    if (q.area) { params.push(q.area); filtros.push(`lower(a.area) = lower($${params.length})`); }
    if (q.categoriaId) { params.push(q.categoriaId); filtros.push(`m.categoria_id = $${params.length}`); }
    if (q.modeloId) { params.push(q.modeloId); filtros.push(`a.modelo_id = $${params.length}`); }
    const rows: Array<Record<string, string | null>> = await this.ds.query(
      `SELECT c.id AS categoria_id, coalesce(c.nombre, 'Sin tipo') AS categoria, m.id AS modelo_id, m.nombre AS modelo, min(a.area) AS area,
              count(*) AS total,
              count(*) FILTER (WHERE a.estado = 'OPERATIVO') AS operativos,
              count(*) FILTER (WHERE a.estado = 'EN_MANTENIMIENTO') AS en_mantenimiento,
              count(*) FILTER (WHERE a.estado = 'FUERA_DE_SERVICIO') AS fuera_de_servicio,
              count(*) FILTER (WHERE a.estado = 'DADO_DE_BAJA') AS dados_de_baja,
              count(*) FILTER (WHERE a.estado = 'EN_BODEGA') AS en_bodega
         FROM activos a
         LEFT JOIN modelos_equipo m ON m.id = a.modelo_id
         LEFT JOIN categorias_equipo c ON c.id = m.categoria_id
        ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
        GROUP BY c.id, c.nombre, m.id, m.nombre, lower(a.area)
        ORDER BY (c.nombre IS NULL), c.nombre, m.nombre, lower(a.area)`,
      params,
    );
    const n = (v: string | null) => Number(v ?? 0);
    const filas = rows.map((r) => ({
      categoriaId: r.categoria_id, categoria: r.categoria!, modeloId: r.modelo_id, modelo: r.modelo, area: r.area!,
      total: n(r.total), operativos: n(r.operativos), enMantenimiento: n(r.en_mantenimiento), fueraDeServicio: n(r.fuera_de_servicio), dadosDeBaja: n(r.dados_de_baja), enBodega: n(r.en_bodega),
    }));
    // En uso = instalados (sin los dados de baja ni los que están en bodega sin instalar).
    const enUso = filas.reduce((s, f) => s + f.total - f.dadosDeBaja - f.enBodega, 0);
    const enBodega = filas.reduce((s, f) => s + f.enBodega, 0);
    return { filas, total: filas.reduce((s, f) => s + f.total, 0), enUso, enBodega };
  }

  // ---------- Internos ----------

  private async conteoEquipos() {
    const rows: Array<{ modelo_id: string; n: string }> = await this.ds.query(`SELECT modelo_id, count(*) AS n FROM activos WHERE modelo_id IS NOT NULL GROUP BY modelo_id`);
    return new Map(rows.map((r) => [r.modelo_id, Number(r.n)]));
  }

  private async exigirNombreLibre(em: EntityManager, nombre: string, excepto?: string) {
    const otro = await em.getRepository(EquipmentModel).findOne({ where: { nombre: ILike(nombre.replace(/[%_\\]/g, '\\$&')) } });
    if (otro && otro.id !== excepto) throw new ConflictException(`Ya existe el tipo de equipo "${otro.nombre}"`);
  }

  /** Busca la categoría sin importar mayúsculas; si no existe la crea. */
  private async categoria(em: EntityManager, nombre: string) {
    const n = limpio(nombre);
    if (n.length < 2) throw new BadRequestException('Indique la categoría del equipo');
    const existente = await em.getRepository(EquipmentCategory).findOne({ where: { nombre: ILike(n.replace(/[%_\\]/g, '\\$&')) } });
    return existente ?? em.getRepository(EquipmentCategory).save({ nombre: n });
  }

  private async materiales(em: EntityManager, items: Array<{ repuestoId: string; cantidad: number }>) {
    const m = new Map<string, number>();
    for (const i of items) if (i.cantidad > 0) m.set(i.repuestoId, (m.get(i.repuestoId) ?? 0) + i.cantidad);
    const ids = [...m.keys()];
    if (ids.length) {
      const encontrados = await em.getRepository(SparePart).find({ where: { id: In(ids) } });
      if (encontrados.length !== ids.length) throw new BadRequestException('Uno de los repuestos no existe');
      const inactivo = encontrados.find((r) => !r.activo);
      if (inactivo) throw new BadRequestException(`El repuesto ${inactivo.codigo} está inactivo`);
    }
    return [...m].map(([repuestoId, cantidad]) => ({ repuestoId, cantidad }));
  }

  /** Borra las categorías que quedaron sin modelos. */
  private async limpiarCategorias(em: EntityManager) {
    await em.query(`DELETE FROM categorias_equipo c WHERE NOT EXISTS (SELECT 1 FROM modelos_equipo m WHERE m.categoria_id = c.id)`);
  }
}
