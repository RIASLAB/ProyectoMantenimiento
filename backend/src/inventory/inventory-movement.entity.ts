import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoMovimiento } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { User } from '../users/user.entity';
import { SparePart } from './spare-part.entity';

/**
 * Movimiento de inventario (INV-02, INV-03). Inmutable: no se edita ni se borra;
 * un error se corrige con un movimiento de ajuste.
 * `cantidad` lleva signo: positiva en entradas, negativa en salidas.
 */
@Entity('movimientos_inventario')
@Index(['repuestoId', 'creadoEn'])
export class InventoryMovement {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => SparePart)
  @JoinColumn({ name: 'repuesto_id' })
  repuesto: SparePart;

  @Column({ name: 'repuesto_id', type: 'uuid' })
  repuestoId: string;

  @Column({ type: 'enum', enum: TipoMovimiento, enumName: 'tipo_movimiento' })
  tipo: TipoMovimiento;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  cantidad: number;

  /** Costo unitario del movimiento (compra: precio pagado; salida: costo promedio vigente). */
  @Column({ name: 'costo_unitario', type: 'numeric', precision: 14, scale: 2, transformer: numeric })
  costoUnitario: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  motivo: string | null;

  /** Referencia externa: n.° de OT, solicitud de compra, factura, etc. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  referencia: string | null;

  /** Identificador generado en el dispositivo para evitar duplicados al sincronizar offline (OFF-02). */
  @Column({ name: 'client_id', type: 'uuid', nullable: true, unique: true })
  clientId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
