import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
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
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}
