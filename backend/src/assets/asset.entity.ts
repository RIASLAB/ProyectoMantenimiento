import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EstadoActivo } from '../common/enums';
import { EquipmentModel } from '../equipment/equipment.entities';
import { AssetDocument } from './asset-document.entity';

/** Máquina / equipo de planta con su ficha técnica (ACT-01). */
@Entity('activos')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 40, unique: true })
  codigo: string;

  /** Código equivalente en SAP (INT-02). */
  @Column({ name: 'codigo_sap', type: 'varchar', length: 40, nullable: true })
  codigoSap: string | null;

  @Column({ length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelo: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fabricante: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  serie: string | null;

  @Column({ length: 100 })
  area: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  ubicacion: string | null;

  @Column({ name: 'fecha_compra', type: 'date', nullable: true })
  fechaCompra: string | null;

  @Column({ name: 'fecha_fin_garantia', type: 'date', nullable: true })
  fechaFinGarantia: string | null;

  @Column({ type: 'enum', enum: EstadoActivo, enumName: 'estado_activo', default: EstadoActivo.OPERATIVO })
  estado: EstadoActivo;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  /** Tipo de equipo (categoría y modelo): define su lista de materiales y los preventivos por tipo. */
  @ManyToOne(() => EquipmentModel, { nullable: true })
  @JoinColumn({ name: 'modelo_id' })
  modeloEquipo: EquipmentModel | null;

  @Index()
  @Column({ name: 'modelo_id', type: 'uuid', nullable: true })
  modeloId: string | null;

  @OneToMany(() => AssetDocument, (d) => d.activo)
  documentos: AssetDocument[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
