import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EstadoActivo } from '../common/enums';

export class CreateAssetDto {
  @IsString() @Matches(/^[A-Za-z0-9._/-]{2,40}$/, { message: 'Código inválido: use letras, números, punto, guion o barra (2 a 40)' })
  codigo: string;

  @IsOptional() @IsString() @MaxLength(40)
  codigoSap?: string | null;

  @IsString() @MinLength(2) @MaxLength(150)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(100)
  modelo?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  fabricante?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  serie?: string | null;

  @IsString() @MinLength(2) @MaxLength(100)
  area: string;

  @IsOptional() @IsString() @MaxLength(150)
  ubicacion?: string | null;

  @IsOptional() @IsDateString({}, { message: 'Fecha de compra inválida (AAAA-MM-DD)' })
  fechaCompra?: string | null;

  @IsOptional() @IsDateString({}, { message: 'Fecha de fin de garantía inválida (AAAA-MM-DD)' })
  fechaFinGarantia?: string | null;

  @IsOptional() @IsEnum(EstadoActivo)
  estado?: EstadoActivo;

  @IsOptional() @IsString() @MaxLength(4000)
  notas?: string | null;

  /** Tipo de equipo (modelo). */
  @IsOptional() @IsUUID()
  modeloId?: string | null;
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}

/** Varios equipos iguales de una vez: el código debe terminar en número y se numeran seguidos (AA-001, AA-002…). */
export class CreateManyAssetsDto extends CreateAssetDto {
  @Type(() => Number) @IsInt() @Min(2) @Max(100)
  cantidad: number;
}
