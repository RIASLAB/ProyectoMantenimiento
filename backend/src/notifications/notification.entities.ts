import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Bandeja de notificaciones (NOT-02): toda notificación queda aquí aunque el aviso al celular falle
 * (por ejemplo en un iPhone sin la app instalada).
 */
@Entity('notificaciones')
@Index(['usuarioId', 'creadoEn'])
// Un mismo aviso programado (p. ej. "preventivo próximo" de una OT) llega una sola vez a cada persona.
@Index(['usuarioId', 'clave'], { unique: true, where: 'clave IS NOT NULL' })
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  /** Tipo de evento: FALLA_REPORTADA, OT_ASIGNADA, COMPRA_SOLICITADA, ... */
  @Column({ length: 40 })
  tipo: string;

  @Column({ length: 150 })
  titulo: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cuerpo: string | null;

  /** Ruta de la app que se abre al tocar la notificación (p. ej. /ordenes/<id>). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  enlace: string | null;

  /** Llave para no repetir avisos programados. */
  @Column({ type: 'varchar', length: 120, nullable: true, select: false })
  clave: string | null;

  @Column({ name: 'leida_en', type: 'timestamptz', nullable: true })
  leidaEn: Date | null;

  /** Falta enviar el aviso al celular (Web Push). */
  @Index({ where: 'push_pendiente' })
  @Column({ name: 'push_pendiente', default: false, select: false })
  pushPendiente: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

/** Suscripción de un navegador/celular a los avisos (Web Push). Un usuario puede tener varias. */
@Entity('suscripciones_push')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @Index()
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ type: 'varchar', length: 1000, unique: true })
  endpoint: string;

  @Column({ length: 200 })
  p256dh: string;

  @Column({ length: 100 })
  auth: string;

  @Column({ name: 'agente', type: 'varchar', length: 300, nullable: true })
  agente: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

export const NOTIFICATION_ENTITIES = [Notification, PushSubscription];
