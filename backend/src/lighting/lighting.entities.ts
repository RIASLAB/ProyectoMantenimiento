import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { numeric } from '../common/numeric.transformer';
import { User } from '../users/user.entity';

/** Tipo de recinto o actividad con sus niveles de iluminación de referencia en lux (mínimo, promedio, máximo). */
@Entity('recintos_iluminacion')
export class LightingRoomType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 150 })
  nombre: string;

  @Column({ type: 'int' })
  minimo: number;

  @Column({ type: 'int' })
  promedio: number;

  @Column({ type: 'int' })
  maximo: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

/** Punto donde se mide la iluminación (ej. "Sala de desposte"). */
@Entity('puntos_iluminacion')
export class LightingPoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  nombre: string;

  @ManyToOne(() => LightingRoomType)
  @JoinColumn({ name: 'recinto_id' })
  recinto: LightingRoomType;

  @Column({ name: 'recinto_id', type: 'uuid' })
  recintoId: string;

  /** Orden en el formato. */
  @Column({ type: 'int', default: 0 })
  orden: number;

  @Column({ default: true })
  vigente: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

/** Medición de iluminación (formato AC-PMT-MI01). Guarda una copia de los puntos y referencias como se midieron. */
@Entity('mediciones_iluminacion')
@Index(['fecha'])
export class LightingSurvey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  fecha: string;

  /** NUTRIALIMENTOS o INDUCARNES. */
  @Column({ length: 60 })
  empresa: string;

  /** "Planta" o el nombre del punto de venta. */
  @Column({ length: 120 })
  lugar: string;

  @Column({ length: 120 })
  evaluador: string;

  @Column({ name: 'cargo_evaluador', length: 120 })
  cargoEvaluador: string;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;

  @Column({ name: 'puntos_cumplen', type: 'int' })
  puntosCumplen: number;

  @Column({ name: 'puntos_no_cumplen', type: 'int' })
  puntosNoCumplen: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @OneToMany(() => LightingReading, (l) => l.medicion, { cascade: true })
  lecturas: LightingReading[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

@Entity('lecturas_iluminacion')
export class LightingReading {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LightingSurvey, (m) => m.lecturas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicion_id' })
  medicion: LightingSurvey;

  @Index()
  @Column({ name: 'medicion_id', type: 'uuid' })
  medicionId: string;

  @Column({ type: 'int' })
  orden: number;

  @Column({ name: 'punto_nombre', length: 120 })
  puntoNombre: string;

  @Column({ name: 'recinto_nombre', length: 150 })
  recintoNombre: string;

  @Column({ name: 'ref_minimo', type: 'int' })
  refMinimo: number;

  @Column({ name: 'ref_promedio', type: 'int' })
  refPromedio: number;

  @Column({ name: 'ref_maximo', type: 'int' })
  refMaximo: number;

  @Column({ type: 'numeric', precision: 8, scale: 1, transformer: numeric })
  medicion1: number;

  @Column({ type: 'numeric', precision: 8, scale: 1, transformer: numeric })
  medicion2: number;

  @Column({ type: 'numeric', precision: 8, scale: 1, transformer: numeric })
  medicion3: number;

  @Column({ type: 'numeric', precision: 8, scale: 1, transformer: numeric })
  media: number;

  @Column()
  cumple: boolean;

  @Column({ name: 'plan_accion', type: 'text', nullable: true })
  planAccion: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;
}

export const LIGHTING_ENTITIES = [LightingRoomType, LightingPoint, LightingSurvey, LightingReading];
