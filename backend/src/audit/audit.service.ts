import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  usuarioId: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Registra una acción. Si se pasa `em`, queda dentro de la misma transacción que la acción. */
  async log(entry: AuditEntry, em?: EntityManager): Promise<void> {
    const r = em ? em.getRepository(AuditLog) : this.repo;
    await r.insert({
      usuarioId: entry.usuarioId,
      accion: entry.accion,
      entidad: entry.entidad,
      entidadId: entry.entidadId ?? null,
      detalle: (entry.detalle ?? null) as never,
    });
  }

  async list(f: { entidad?: string; entidadId?: string; usuarioId?: string; limite?: number; desde?: number }) {
    const qb = this.repo
      .createQueryBuilder('b')
      .leftJoin('b.usuario', 'u')
      .addSelect(['u.id', 'u.nombre'])
      .orderBy('b.id', 'DESC')
      .take(Math.min(f.limite ?? 50, 200))
      .skip(f.desde ?? 0);
    if (f.entidad) qb.andWhere('b.entidad = :e', { e: f.entidad });
    if (f.entidadId) qb.andWhere('b.entidadId = :ei', { ei: f.entidadId });
    if (f.usuarioId) qb.andWhere('b.usuarioId = :u', { u: f.usuarioId });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
