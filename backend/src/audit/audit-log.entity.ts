import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Bitácora de auditoría (SEG-05). Solo se inserta; no hay endpoints para editar
 * ni borrar, y la migración instala un trigger que impide UPDATE/DELETE.
 */
@Entity('bitacora')
@Index(['entidad', 'entidadId'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({ length: 80 })
  accion: string;

  @Column({ length: 60 })
  entidad: string;

  @Column({ name: 'entidad_id', type: 'varchar', length: 60, nullable: true })
  entidadId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detalle: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
