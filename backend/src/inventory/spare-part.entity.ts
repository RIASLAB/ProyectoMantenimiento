import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { numeric } from '../common/numeric.transformer';

/** Repuesto del catálogo (INV-01). El stock NO se guarda aquí: se calcula de los movimientos. */
@Entity('repuestos')
export class SparePart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 40, unique: true })
  codigo: string;

  @Column({ name: 'codigo_sap', type: 'varchar', length: 40, nullable: true })
  codigoSap: string | null;

  @Column({ length: 200 })
  descripcion: string;

  /** Unidad de medida: UND, M, KG, L, JGO, etc. */
  @Column({ length: 20 })
  unidad: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ubicacion: string | null;

  @Column({ name: 'stock_minimo', type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric })
  stockMinimo: number;

  /**
   * Costo promedio ponderado vigente (D-04 asumido). Se recalcula en cada entrada por compra.
   * Es un dato derivado de los movimientos; se guarda para no recalcular todo el kardex.
   */
  @Column({ name: 'costo_promedio', type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numeric })
  costoPromedio: number;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
