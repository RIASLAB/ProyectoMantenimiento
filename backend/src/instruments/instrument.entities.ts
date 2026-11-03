import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

export const TIPOS_INSTRUMENTO = ['TERMOMETRO', 'LUXOMETRO', 'BASCULA', 'MANOMETRO', 'MULTIMETRO', 'OTRO'] as const;
export type TipoInstrumento = (typeof TIPOS_INSTRUMENTO)[number];

/** Instrumento de medición que debe estar calibrado (termómetros, luxómetro, básculas…). */
@Entity('instrumentos')
export class Instrument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 40 })
  codigo: string;

  @Column({ length: 150 })
  nombre: string;

  @Column({ length: 20 })
  tipo: TipoInstrumento;

  @Column({ type: 'varchar', length: 100, nullable: true })
  marca: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelo: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  serie: string | null;

  @Column({ length: 100 })
  area: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  ubicacion: string | null;

  /** Rango y resolución, ej. "-50 a 150 °C, 0,1 °C". */
  @Column({ type: 'varchar', length: 120, nullable: true })
  rango: string | null;

  /** Cada cuántos meses se calibra. */
  @Column({ name: 'frecuencia_meses', type: 'int' })
  frecuenciaMeses: number;

  @Column({ default: true })
  vigente: boolean;

  @OneToMany(() => Calibration, (c) => c.instrumento)
  calibraciones: Calibration[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

/** Calibración o verificación de un instrumento, con su certificado. Inmutable. */
@Entity('calibraciones')
@Index(['instrumentoId', 'fecha'])
export class Calibration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Instrument, (i) => i.calibraciones)
  @JoinColumn({ name: 'instrumento_id' })
  instrumento: Instrument;

  @Column({ name: 'instrumento_id', type: 'uuid' })
  instrumentoId: string;

  @Column({ type: 'date' })
  fecha: string;

  /** Hasta cuándo vale (por defecto, fecha + frecuencia). */
  @Column({ name: 'vence_en', type: 'date' })
  venceEn: string;

  @Column({ length: 150 })
  laboratorio: string;

  @Column({ name: 'numero_certificado', type: 'varchar', length: 80, nullable: true })
  numeroCertificado: string | null;

  /** APTO: el instrumento sigue en uso; NO_APTO: se retira o se ajusta. */
  @Column({ length: 10 })
  resultado: 'APTO' | 'NO_APTO';

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;

  @Column({ name: 'archivo_ruta', type: 'varchar', length: 300, nullable: true, select: false })
  archivoRuta: string | null;

  @Column({ name: 'archivo_nombre', type: 'varchar', length: 200, nullable: true })
  archivoNombre: string | null;

  @Column({ name: 'archivo_mime', type: 'varchar', length: 100, nullable: true })
  archivoMime: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

export const INSTRUMENT_ENTITIES = [Instrument, Calibration];
