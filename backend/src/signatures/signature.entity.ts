import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

/** Formatos que se pueden firmar y la clave de su registro. */
export const ENTIDADES_FIRMA = ['OT', 'CHECKLIST', 'PLANILLA', 'ILUMINACION'] as const;
export type EntidadFirma = (typeof ENTIDADES_FIRMA)[number];

/**
 * Firma hecha en la pantalla (dedo o lápiz) sobre un formato. Una por casilla del formato (ej. "Jefe de mantenimiento").
 * Inmutable: no se edita ni se borra (trigger en la base de datos).
 */
@Entity('firmas')
@Index(['entidad', 'entidadId', 'casilla'], { unique: true })
export class Signature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20 })
  entidad: EntidadFirma;

  /** Id del registro; en la planilla de temperaturas, "AAAA-MM-DD|Área". */
  @Column({ name: 'entidad_id', length: 150 })
  entidadId: string;

  /** Casilla del formato: RESPONSABLE, JEFE_MANTENIMIENTO, LIDER_AREA, REALIZO, VERIFICO, EVALUADOR, REVISO. */
  @Column({ length: 40 })
  casilla: string;

  /** Nombre de quien firma (puede ser alguien sin usuario, como el líder de área). */
  @Column({ length: 120 })
  nombre: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  cargo: string | null;

  /** Imagen PNG de la firma como data URL. */
  @Column({ type: 'text', select: false })
  imagen: string;

  /** Usuario con cuya sesión se capturó la firma. */
  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
