import { Column, CreateDateColumn, Entity, Generated, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EstadoCompra, OrigenCompra } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { SparePart } from '../inventory/spare-part.entity';
import { WorkOrder } from '../maintenance/maintenance.entities';
import { User } from '../users/user.entity';

/**
 * Solicitud de compra de un repuesto (COM-01 a COM-08).
 * No guarda un autorizador fijo: la aprueba quien sea el autorizador vigente al momento de decidir,
 * así al cambiar el autorizador las pendientes pasan al nuevo (D-08 asumido).
 */
@Entity('solicitudes_compra')
@Index(['estado'])
@Index(['ordenId', 'repuestoId'])
export class PurchaseRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', unique: true })
  @Generated('increment')
  numero: number;

  @Column({ type: 'enum', enum: EstadoCompra, enumName: 'estado_compra', default: EstadoCompra.PENDIENTE })
  estado: EstadoCompra;

  @Column({ type: 'enum', enum: OrigenCompra, enumName: 'origen_compra' })
  origen: OrigenCompra;

  @ManyToOne(() => SparePart)
  @JoinColumn({ name: 'repuesto_id' })
  repuesto: SparePart;

  @Column({ name: 'repuesto_id', type: 'uuid' })
  repuestoId: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  cantidad: number;

  @ManyToOne(() => WorkOrder, { nullable: true })
  @JoinColumn({ name: 'orden_id' })
  orden: WorkOrder | null;

  @Column({ name: 'orden_id', type: 'uuid', nullable: true })
  ordenId: string | null;

  @Column({ type: 'text' })
  justificacion: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'solicitado_por_id' })
  solicitadoPor: User | null;

  @Column({ name: 'solicitado_por_id', type: 'uuid', nullable: true })
  solicitadoPorId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'decidida_por_id' })
  decididaPor: User | null;

  @Column({ name: 'decidida_por_id', type: 'uuid', nullable: true })
  decididaPorId: string | null;

  @Column({ name: 'decidida_en', type: 'timestamptz', nullable: true })
  decididaEn: Date | null;

  @Column({ name: 'motivo_rechazo', type: 'varchar', length: 500, nullable: true })
  motivoRechazo: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  proveedor: string | null;

  @Column({ name: 'numero_orden_compra', type: 'varchar', length: 60, nullable: true })
  numeroOrdenCompra: string | null;

  @Column({ name: 'costo_estimado', type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: numeric })
  costoEstimado: number | null;

  @Column({ name: 'comprada_en', type: 'timestamptz', nullable: true })
  compradaEn: Date | null;

  @Column({ name: 'cantidad_recibida', type: 'numeric', precision: 14, scale: 3, nullable: true, transformer: numeric })
  cantidadRecibida: number | null;

  @Column({ name: 'costo_unitario', type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: numeric })
  costoUnitario: number | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  factura: string | null;

  @Column({ name: 'recibida_en', type: 'timestamptz', nullable: true })
  recibidaEn: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recibida_por_id' })
  recibidaPor: User | null;

  @Column({ name: 'recibida_por_id', type: 'uuid', nullable: true })
  recibidaPorId: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
