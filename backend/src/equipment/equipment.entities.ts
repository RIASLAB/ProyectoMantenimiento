import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { numeric } from '../common/numeric.transformer';
import { SparePart } from '../inventory/spare-part.entity';

/** Categoría de equipo, ej. "Aire acondicionado", "Molino", "Embutidora". */
@Entity('categorias_equipo')
export class EquipmentCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 100 })
  nombre: string;

  @OneToMany(() => EquipmentModel, (m) => m.categoria)
  modelos: EquipmentModel[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

/**
 * Modelo de equipo dentro de una categoría, ej. "Mini split 12.000 BTU". Varias máquinas iguales comparten
 * el modelo y con él su lista de materiales y sus preventivos.
 */
@Entity('modelos_equipo')
export class EquipmentModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => EquipmentCategory, (c) => c.modelos)
  @JoinColumn({ name: 'categoria_id' })
  categoria: EquipmentCategory;

  @Column({ name: 'categoria_id', type: 'uuid' })
  categoriaId: string;

  /** Único en todo el sistema (así se identifica en la carga desde Excel). */
  @Index({ unique: true })
  @Column({ length: 120 })
  nombre: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fabricante: string | null;

  /** Referencia del fabricante. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  referencia: string | null;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @OneToMany(() => EquipmentModelPart, (p) => p.modelo, { cascade: true })
  materiales: EquipmentModelPart[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

/** Lista de materiales del modelo: repuestos que usa el equipo y cantidad por mantenimiento. */
@Entity('modelo_materiales')
@Index(['modeloId', 'repuestoId'], { unique: true })
export class EquipmentModelPart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => EquipmentModel, (m) => m.materiales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'modelo_id' })
  modelo: EquipmentModel;

  @Column({ name: 'modelo_id', type: 'uuid' })
  modeloId: string;

  @ManyToOne(() => SparePart)
  @JoinColumn({ name: 'repuesto_id' })
  repuesto: SparePart;

  @Column({ name: 'repuesto_id', type: 'uuid' })
  repuestoId: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  cantidad: number;
}

export const EQUIPMENT_ENTITIES = [EquipmentCategory, EquipmentModel, EquipmentModelPart];
