export type Rol = 'ADMIN' | 'AUTORIZADOR' | 'TECNICO' | 'OPERARIO';
export type EstadoActivo = 'OPERATIVO' | 'EN_MANTENIMIENTO' | 'FUERA_DE_SERVICIO' | 'DADO_DE_BAJA';
export type TipoMovimiento = 'ENTRADA_COMPRA' | 'ENTRADA_AJUSTE' | 'ENTRADA_DEVOLUCION' | 'SALIDA_CONSUMO' | 'SALIDA_AJUSTE';

export interface SessionUser {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
}

export interface User extends SessionUser {
  email: string | null;
  activo: boolean;
  bloqueadoHasta: string | null;
  creadoEn: string;
}

export interface AssetDocument {
  id: string;
  nombreOriginal: string;
  mime: string;
  tamanoBytes: number;
  creadoEn: string;
  subidoPor: { id: string; nombre: string } | null;
}

export interface Asset {
  id: string;
  codigo: string;
  codigoSap: string | null;
  nombre: string;
  modelo: string | null;
  fabricante: string | null;
  serie: string | null;
  area: string;
  ubicacion: string | null;
  fechaCompra: string | null;
  fechaFinGarantia: string | null;
  estado: EstadoActivo;
  notas: string | null;
  documentos?: AssetDocument[];
  creadoEn: string;
  actualizadoEn: string;
}

export interface SparePart {
  id: string;
  codigo: string;
  codigoSap: string | null;
  descripcion: string;
  unidad: string;
  ubicacion: string | null;
  stockMinimo: number;
  costoPromedio: number;
  activo: boolean;
  stock: number;
  valorInventario: number;
  bajoMinimo: boolean;
}

export interface KardexRow {
  id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costoUnitario: number;
  valor: number;
  motivo: string | null;
  referencia: string | null;
  usuario: string | null;
  fecha: string;
  saldo: number;
}

export interface AuditItem {
  id: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: Record<string, unknown> | null;
  creadoEn: string;
  usuario: { id: string; nombre: string } | null;
}
