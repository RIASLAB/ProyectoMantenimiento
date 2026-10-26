import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { TipoMovimiento } from '../common/enums';

export class CreateSparePartDto {
  @IsString() @Matches(/^[A-Za-z0-9._/-]{2,40}$/, { message: 'Código inválido: use letras, números, punto, guion o barra (2 a 40)' })
  codigo: string;

  @IsOptional() @IsString() @MaxLength(40)
  codigoSap?: string | null;

  @IsString() @MinLength(2) @MaxLength(200)
  descripcion: string;

  @IsString() @MinLength(1) @MaxLength(20)
  unidad: string;

  @IsOptional() @IsString() @MaxLength(100)
  ubicacion?: string | null;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  stockMinimo?: number;
}

export class UpdateSparePartDto extends PartialType(CreateSparePartDto) {
  @IsOptional() @IsBoolean()
  activo?: boolean;
}

export class CreateMovementDto {
  @IsUUID()
  repuestoId: string;

  @IsEnum(TipoMovimiento)
  tipo: TipoMovimiento;

  /** Siempre positiva; el signo lo da el tipo de movimiento. */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive()
  cantidad: number;

  /** Obligatorio en ENTRADA_COMPRA: precio unitario pagado. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  costoUnitario?: number;

  @IsOptional() @IsString() @MaxLength(300)
  motivo?: string;

  @IsOptional() @IsString() @MaxLength(80)
  referencia?: string;

  /** UUID generado en el dispositivo; si se repite, se devuelve el movimiento ya registrado. */
  @IsOptional() @IsUUID()
  clientId?: string;
}

export class PhysicalCountDto {
  @IsUUID()
  repuestoId: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  cantidadContada: number;

  @IsString() @MinLength(3) @MaxLength(300)
  motivo: string;
}
