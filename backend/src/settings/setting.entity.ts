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
/** Control documental de los formatos impresos (código, versión y fechas), por formato. */
export const PARAM_FORMATOS = 'formatos_documentales';

export interface FormatoDocumental {
  nombre: string;
  codigo: string;
  version: string;
  fechaElaboracion: string | null;
  fechaActualizacion: string | null;
}

/** Los de los formatos en papel de la planta (archivos de mantenimiento entregados por la empresa). */
export const FORMATOS_POR_DEFECTO: Record<string, FormatoDocumental> = {
  OT: { nombre: 'Orden de trabajo mantenimiento de equipos e instalaciones', codigo: 'AC-PMT FR03', version: '6', fechaElaboracion: '2018-10-29', fechaActualizacion: '2024-11-09' },
  HOJA_VIDA: { nombre: 'Hoja de vida de maquinaria y equipos', codigo: 'AC-PMT-FR05', version: '2', fechaElaboracion: '2019-10-29', fechaActualizacion: null },
  TEMPERATURA: { nombre: 'Registro de temperatura de cuartos fríos y áreas', codigo: 'AC-PMT-FR01', version: '2', fechaElaboracion: '2024-01-09', fechaActualizacion: '2025-10-08' },
  ILUMINACION: { nombre: 'Formato de registro de medición de iluminación', codigo: 'AC-PMT-MI01', version: '1', fechaElaboracion: '2024-10-09', fechaActualizacion: '2025-08-12' },
  PLANEADOR: { nombre: 'Planeador de mantenimiento', codigo: 'AC-PMT-CR01', version: '4', fechaElaboracion: '2019-12-09', fechaActualizacion: '2025-10-14' },
};
