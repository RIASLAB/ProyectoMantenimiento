import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Parámetros configurables desde la app, sin cambios de código (ej. autorizador de compras). */
@Entity('parametros')
export class Setting {
  @PrimaryColumn({ length: 80 })
  clave: string;

  @Column({ type: 'text', nullable: true })
  valor: string | null;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

export const PARAM_AUTORIZADOR_COMPRAS = 'autorizador_compras_id';
export const PARAM_TARIFA_HORA = 'tarifa_hora_tecnico';
