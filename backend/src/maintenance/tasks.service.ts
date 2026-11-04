import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../common/auth.decorators';
import { CreateTaskDto, UpdateTaskDto } from './maintenance.dto';
import { MaintenanceTask, PlanTask } from './maintenance.entities';

const limpio = (s: string | null | undefined) => s?.trim().replace(/\s+/g, ' ') || null;

/** Catálogo de tareas de mantenimiento que se eligen al armar un preventivo (D-31). */
@Injectable()
export class TasksService {
  constructor(private readonly ds: DataSource, private readonly audit: AuditService) {}

  private get repo() {
    return this.ds.getRepository(MaintenanceTask);
  }

  /** Activas por defecto; `todas` incluye las desactivadas. Cada una con el número de planes que la usan. */
  async listar(todas = false) {
    const tareas = await this.repo.find({ where: todas ? {} : { activa: true }, order: { grupo: { direction: 'ASC', nulls: 'LAST' }, nombre: 'ASC' } });
    const usos: Array<{ tarea_id: string; n: string }> = await this.ds.query('SELECT tarea_id, count(*) AS n FROM plan_tareas GROUP BY tarea_id');
    const n = new Map(usos.map((u) => [u.tarea_id, Number(u.n)]));
    return tareas.map((t) => ({ ...t, planes: n.get(t.id) ?? 0 }));
  }

  async crear(dto: CreateTaskDto, actor: SessionUser) {
    const nombre = limpio(dto.nombre)!;
    await this.exigirNombreLibre(nombre);
    return this.ds.transaction(async (em) => {
      const t = await em.getRepository(MaintenanceTask).save({ nombre, grupo: limpio(dto.grupo), descripcion: dto.descripcion?.trim() || null });
      await this.audit.log({ usuarioId: actor.id, accion: 'TAREA_CREADA', entidad: 'tarea', entidadId: t.id, detalle: { nombre, grupo: t.grupo } }, em);
      return t;
    });
  }

  async actualizar(id: string, dto: UpdateTaskDto, actor: SessionUser) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Tarea no encontrada');
    const cambios: Partial<MaintenanceTask> = {};
    if (dto.nombre !== undefined) {
      cambios.nombre = limpio(dto.nombre)!;
      if (cambios.nombre.toLowerCase() !== t.nombre.toLowerCase()) await this.exigirNombreLibre(cambios.nombre);
    }
    if (dto.grupo !== undefined) cambios.grupo = limpio(dto.grupo);
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion?.trim() || null;
    if (dto.activa !== undefined) cambios.activa = dto.activa;
    return this.ds.transaction(async (em) => {
      await em.getRepository(MaintenanceTask).update(id, cambios);
      await this.audit.log({ usuarioId: actor.id, accion: 'TAREA_ACTUALIZADA', entidad: 'tarea', entidadId: id, detalle: { nombre: t.nombre, ...cambios } }, em);
      return em.getRepository(MaintenanceTask).findOneByOrFail({ id });
    });
  }

  /** Solo si ningún plan la usa; si no, se desactiva para que no aparezca al armar planes nuevos. */
  async eliminar(id: string, actor: SessionUser) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Tarea no encontrada');
    const usos = await this.ds.getRepository(PlanTask).count({ where: { tareaId: id } });
    if (usos) throw new BadRequestException(`La tarea está en ${usos} plan${usos === 1 ? '' : 'es'}: desactívela en lugar de eliminarla`);
    await this.ds.transaction(async (em) => {
      await em.getRepository(MaintenanceTask).delete(id);
      await this.audit.log({ usuarioId: actor.id, accion: 'TAREA_ELIMINADA', entidad: 'tarea', entidadId: id, detalle: { nombre: t.nombre } }, em);
    });
    return { ok: true };
  }

  private async exigirNombreLibre(nombre: string) {
    const dup = await this.repo.createQueryBuilder('t').where('lower(t.nombre) = lower(:n)', { n: nombre }).getOne();
    if (dup) throw new ConflictException(`Ya existe la tarea "${dup.nombre}"${dup.activa ? '' : ' (desactivada)'}`);
  }
}
