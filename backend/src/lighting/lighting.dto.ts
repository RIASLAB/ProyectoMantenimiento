import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength,
  ValidateNested,
} from 'class-validator';

export class RoomTypeDto {
  @IsString() @MinLength(3) @MaxLength(150)
  nombre: string;

  @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  minimo: number;

  @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  promedio: number;

  @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  maximo: number;
}

export class CreatePointDto {
  @IsString() @MinLength(2) @MaxLength(120)
  nombre: string;

  @IsUUID()
  recintoId: string;
}

export class UpdatePointDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  nombre?: string;

  @IsOptional() @IsUUID()
  recintoId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000)
  orden?: number;

  @IsOptional() @IsBoolean()
  vigente?: boolean;
}

export class ReadingDto {
  @IsUUID()
  puntoId: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100000)
  medicion1: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100000)
  medicion2: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100000)
  medicion3: number;

  @IsOptional() @IsString() @MaxLength(1000)
  planAccion?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  observaciones?: string;
}

export const EMPRESAS = ['NUTRIALIMENTOS', 'INDUCARNES'] as const;

export class CreateSurveyDto {
  @IsDateString()
  fecha: string;

  @IsIn(EMPRESAS as unknown as string[])
  empresa: string;

  /** "Planta" o el nombre del punto de venta. */
  @IsString() @MinLength(2) @MaxLength(120)
  lugar: string;

  @IsString() @MinLength(3) @MaxLength(120)
  evaluador: string;

  @IsString() @MinLength(3) @MaxLength(120)
  cargoEvaluador: string;

  @IsOptional() @IsString() @MaxLength(2000)
  observaciones?: string;

  @IsArray() @ArrayMinSize(1, { message: 'Registre al menos un punto' }) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => ReadingDto)
  lecturas: ReadingDto[];
}
