import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { EstadoCompra } from '../common/enums';

export class CreatePurchaseDto {
  @IsUUID()
  repuestoId: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive()
  cantidad: number;

  @IsString() @MinLength(5, { message: 'Explique para qué se necesita (mínimo 5 caracteres)' }) @MaxLength(1000)
  justificacion: string;

  @IsOptional() @IsUUID()
  ordenId?: string;
}

export class RejectDto {
  @IsString() @MinLength(3, { message: 'Indique el motivo del rechazo' }) @MaxLength(500)
  motivo: string;
}

export class BuyDto {
  @IsString() @MinLength(2) @MaxLength(150)
  proveedor: string;

  @IsOptional() @IsString() @MaxLength(60)
  numeroOrdenCompra?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  costoEstimado?: number;
}

export class ReceiveDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive()
  cantidadRecibida: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  costoUnitario: number;

  @IsOptional() @IsString() @MaxLength(60)
  factura?: string;
}

export class ListPurchasesQuery {
  @IsOptional() @IsString()
  vista?: 'pendientes' | 'en_proceso' | 'cerradas' | 'todas';

  @IsOptional() @IsEnum(EstadoCompra)
  estado?: EstadoCompra;

  @IsOptional() @IsUUID()
  ordenId?: string;

  @IsOptional() @IsUUID()
  repuestoId?: string;
}
