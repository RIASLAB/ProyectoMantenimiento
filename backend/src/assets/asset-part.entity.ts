import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { numeric } from '../common/numeric.transformer';
import { SparePart } from '../inventory/spare-part.entity';
import { Asset } from './asset.entity';

/**
 * Lista de materiales propia de una máquina (D-30). Si la máquina tiene una, se usa en lugar de la de su tipo de equipo;
 * así una máquina distinta (o sin tipo) tiene su lista sin crear un tipo.
 */
@Entity('activo_materiales')
@Index(['activoId', 'repuestoId'], { unique: true })
export class AssetPart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activo_id' })
  activo: Asset;

  @Column({ name: 'activo_id', type: 'uuid' })
  activoId: string;

  @ManyToOne(() => SparePart)
  @JoinColumn({ name: 'repuesto_id' })
  repuesto: SparePart;

  @Column({ name: 'repuesto_id', type: 'uuid' })
  repuestoId: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  cantidad: number;
}
