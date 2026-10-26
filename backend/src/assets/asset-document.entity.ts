import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Asset } from './asset.entity';

/** Manual o documento adjunto a una máquina (ACT-02). */
@Entity('activo_documentos')
export class AssetDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Asset, (a) => a.documentos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activo_id' })
  activo: Asset;

  @Column({ name: 'activo_id', type: 'uuid' })
  activoId: string;

  @Column({ name: 'nombre_original', length: 255 })
  nombreOriginal: string;

  /** Nombre del archivo en disco (aleatorio, no expuesto como ruta). */
  @Column({ name: 'archivo', length: 255, select: false })
  archivo: string;

  @Column({ length: 100 })
  mime: string;

  @Column({ name: 'tamano_bytes', type: 'int' })
  tamanoBytes: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'subido_por_id' })
  subidoPor: User | null;

  @Column({ name: 'subido_por_id', type: 'uuid', nullable: true })
  subidoPorId: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
