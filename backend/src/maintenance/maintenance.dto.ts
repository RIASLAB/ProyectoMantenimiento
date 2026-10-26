import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min,
  MinLength, ValidateNested,
} from 'class-validator';
import { EstadoOrden, Prioridad, TipoOrden, UnidadFrecuencia } from '../common/enums';

export class ReportFaultDto {
  @IsUUID()
  activoId: string;

  @IsString() @MinLength(5, { message: 'Describa la falla con al menos 5 caracteres' }) @MaxLength(2000)
  descripcion: string;

  @IsBoolean()
  maquinaParada: boolean;

  @IsOptional() @IsEnum(Prioridad)
  prioridad?: Prioridad;

  /** Momento real del reporte (si se hizo sin conexión, la hora del dispositivo). */
  @IsOptional() @IsDateString()
  reportadoEn?: string;

  @IsOptional() @IsUUID()
  clientId?: string;
}

export class AssignDto {
  @IsUUID()
  tecnicoId: string;
}

export class NoteDto {
  @IsOptional() @IsString() @MaxLength(500)
  nota?: string;
}

export class CancelDto {
  @IsString() @MinLength(3) @MaxLength(300)
  motivo: string;
}

export class PartQtyDto {
  @IsUUID()
  repuestoId: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  cantidad: number;
}

export class LaborDto {
  @IsUUID()
  tecnicoId: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(200)
  horas: number;
}

export class CloseOrderDto {
  @IsString() @MinLength(5, { message: 'Describa el trabajo realizado' }) @MaxLength(4000)
  trabajoRealizado: string;

  /** Repuestos realmente usados. Los planificados que no aparezcan se registran con cantidad 0. */
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PartQtyDto)
  repuestosUsados: PartQtyDto[];

  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => LaborDto)
  manoObra: LaborDto[];

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  costoServiciosExternos?: number;

  /** Hora en que la máquina volvió a operar. Obligatoria si la máquina estaba parada. */
  @IsOptional() @IsDateString()
  finParada?: string;
}

export class PlannedPartsDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PartQtyDto)
  repuestos: PartQtyDto[];
}

export class ListOrdersQuery {
  @IsOptional() @IsEnum(EstadoOrden, { each: true })
  estado?: EstadoOrden | EstadoOrden[];

  @IsOptional() @IsEnum(TipoOrden)
  tipo?: TipoOrden;

  @IsOptional() @IsUUID()
  activoId?: string;

  /** "abiertas" = todo lo que no está cerrado ni cancelado. */
  @IsOptional() @IsString()
  vista?: 'abiertas' | 'cerradas' | 'todas';

  @IsOptional() @IsString()
  mias?: string;
}

export class CreatePlanDto {
  @IsUUID()
  activoId: string;

  @IsString() @MinLength(3) @MaxLength(150)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(4000)
  tareas?: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(365)
  frecuenciaValor: number;

  @IsEnum(UnidadFrecuencia)
  frecuenciaUnidad: UnidadFrecuencia;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90)
  diasAviso?: number;

  @IsOptional() @IsUUID()
  tecnicoId?: string | null;

  /** Fecha del primer mantenimiento. */
  @IsDateString()
  primeraFecha: string;

  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PartQtyDto)
  repuestos: PartQtyDto[];
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(150)
  nombre?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  tareas?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365)
  frecuenciaValor?: number;

  @IsOptional() @IsEnum(UnidadFrecuencia)
  frecuenciaUnidad?: UnidadFrecuencia;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90)
  diasAviso?: number;

  @IsOptional() @IsUUID()
  tecnicoId?: string | null;

  @IsOptional() @IsBoolean()
  vigente?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PartQtyDto)
  repuestos?: PartQtyDto[];
}
