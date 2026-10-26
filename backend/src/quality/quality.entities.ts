import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { numeric } from '../common/numeric.transformer';
import { User } from '../users/user.entity';

/** Punto de control de temperatura de un equipo, con sus límites críticos (CAL-02, D-06). */
@Entity('puntos_control')
export class ControlPoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'activo_id' })
  activo: Asset;

  @Column({ name: 'activo_id', type: 'uuid' })
  activoId: string;

  /** Ej. "Temperatura de cámara", "Centro térmico del producto". */
  @Column({ length: 120 })
  nombre: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numeric })
  minimo: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numeric })
  maximo: number | null;

  /** Cada cuántas horas se espera un registro (CAL-07). */
  @Column({ name: 'frecuencia_horas', type: 'int', nullable: true })
  frecuenciaHoras: number | null;

  @Column({ default: true })
  vigente: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

/**
 * Registro de temperatura (CAL-01, CAL-03). Inmutable: un trigger impide editarlo o borrarlo;
 * una corrección se hace con una anulación que queda aparte (CAL-05).
 * Guarda los límites vigentes al momento del registro, para que la evaluación no cambie si luego se ajustan.
 */
@Entity('registros_temperatura')
@Index(['registradoEn'])
@Index(['puntoId', 'registradoEn'])
export class TemperatureRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ControlPoint)
  @JoinColumn({ name: 'punto_id' })
  punto: ControlPoint;

  @Column({ name: 'punto_id', type: 'uuid' })
  puntoId: string;

  @Column({ name: 'activo_id', type: 'uuid' })
  activoId: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, transformer: numeric })
  valor: number;

  @Column({ name: 'limite_minimo', type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numeric })
  limiteMinimo: number | null;

  @Column({ name: 'limite_maximo', type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numeric })
  limiteMaximo: number | null;

  @Column({ name: 'fuera_de_rango' })
  fueraDeRango: boolean;

  @Column({ name: 'accion_correctiva', type: 'text', nullable: true })
  accionCorrectiva: string | null;

  /** Hora en que se tomó la lectura (la del dispositivo si se registró sin conexión). */
  @Column({ name: 'registrado_en', type: 'timestamptz' })
  registradoEn: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true, unique: true })
  clientId: string | null;

  /** Hora en que llegó al servidor. */
  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

export type TipoItem = 'SI_NO' | 'NUMERO' | 'TEXTO';

export interface ChecklistItem {
  id: string;
  texto: string;
  tipo: TipoItem;
  obligatorio: boolean;
  /** SI_NO: respuesta conforme ("SI" por defecto). */
  esperado?: 'SI' | 'NO';
  /** NUMERO: rango conforme. */
  minimo?: number | null;
  maximo?: number | null;
}

/** Plantilla de checklist pre-operacional o de aseo (CAL-04). */
@Entity('plantillas_checklist')
export class ChecklistTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  area: string | null;

  /** Si aplica a un equipo específico. */
  @ManyToOne(() => Asset, { nullable: true })
  @JoinColumn({ name: 'activo_id' })
  activo: Asset | null;

  @Column({ name: 'activo_id', type: 'uuid', nullable: true })
  activoId: string | null;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'jsonb' })
  items: ChecklistItem[];

  @Column({ default: true })
  vigente: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

export interface ChecklistAnswer {
  itemId: string;
  texto: string;
  tipo: TipoItem;
  valor: string | number | null;
  conforme: boolean;
}

/** Checklist diligenciado (CAL-04). Inmutable; guarda una copia de las preguntas tal como se respondieron. */
@Entity('registros_checklist')
@Index(['registradoEn'])
export class ChecklistRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ChecklistTemplate)
  @JoinColumn({ name: 'plantilla_id' })
  plantilla: ChecklistTemplate;

  @Column({ name: 'plantilla_id', type: 'uuid' })
  plantillaId: string;

  @Column({ name: 'plantilla_nombre', length: 150 })
  plantillaNombre: string;

  @ManyToOne(() => Asset, { nullable: true })
  @JoinColumn({ name: 'activo_id' })
  activo: Asset | null;

  @Column({ name: 'activo_id', type: 'uuid', nullable: true })
  activoId: string | null;

  @Column({ type: 'jsonb' })
  respuestas: ChecklistAnswer[];

  @Column({ name: 'no_conformes', type: 'int' })
  noConformes: number;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;

  @Column({ name: 'accion_correctiva', type: 'text', nullable: true })
  accionCorrectiva: string | null;

  @Column({ name: 'registrado_en', type: 'timestamptz' })
  registradoEn: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true, unique: true })
  clientId: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

/** Anulación de un registro de calidad (CAL-05): el registro original se conserva; esto lo marca como anulado. */
@Entity('anulaciones_calidad')
@Index(['tipo', 'registroId'], { unique: true })
export class QualityVoid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20 })
  tipo: 'TEMPERATURA' | 'CHECKLIST';

  @Column({ name: 'registro_id', type: 'uuid' })
  registroId: string;

  @Column({ length: 500 })
  motivo: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

export const QUALITY_ENTITIES = [ControlPoint, TemperatureRecord, ChecklistTemplate, ChecklistRecord, QualityVoid];
