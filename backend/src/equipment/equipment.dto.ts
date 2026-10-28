import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PartQtyDto } from '../maintenance/maintenance.dto';

export class CreateModelDto {
  /** Nombre de la categoría; si no existe se crea (ej. "Aire acondicionado"). */
  @IsString() @MinLength(2) @MaxLength(100)
  categoria: string;

  @IsString() @MinLength(2) @MaxLength(120)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(100)
  fabricante?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  referencia?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  descripcion?: string | null;

  /** Lista de materiales: repuestos que usa el equipo y cantidad por mantenimiento. */
  @IsArray() @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => PartQtyDto)
  materiales: PartQtyDto[];
}

export class UpdateModelDto extends PartialType(CreateModelDto) {}

export class ResumenQuery {
  @IsOptional() @IsString() @MaxLength(100)
  area?: string;

  @IsOptional() @IsUUID()
  categoriaId?: string;

  @IsOptional() @IsUUID()
  modeloId?: string;
}
