import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min,
  MinLength, ValidateNested,
} from 'class-validator';
import { EstadoOrden, Prioridad, TipoOrden, UnidadFrecuencia, VERIFICACIONES_CIERRE } from '../common/enums';

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

  /** Materiales que ya se sabe que se van a necesitar (solo administrador o técnico). */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PartQtyDto)
  repuestos?: PartQtyDto[];
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

export class VerificationDto {
  @IsIn(VERIFICACIONES_CIERRE.map((v) => v.id))
  id: string;

  @IsBoolean()
  cumple: boolean;
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

  /** UUID generado en el dispositivo: un cierre reenviado al sincronizar no se aplica dos veces. */
  @IsOptional() @IsUUID()
  clientId?: string;

  /** El técnico cerró sin señal; la hora real del cierre es `cerradaEn`. */
  @IsOptional() @IsBoolean()
  registradoSinConexion?: boolean;

  @IsOptional() @IsDateString()
  cerradaEn?: string;

  /** Preventivo: día en que se hizo (AAAA-MM-DD); por defecto, el día del cierre. El siguiente se cuenta desde aquí (D-33). */
  @IsOptional() @IsDateString()
  fechaRealizacion?: string;

  /** Verificaciones de entrega del formato (cumple / no cumple). */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => VerificationDto)
  verificaciones?: VerificationDto[];

  @IsOptional() @IsString() @MaxLength(4000)
  observaciones?: string;
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

  /** Cerradas entre estas fechas (AAAA-MM-DD, en la hora de la planta), para el paquete mensual. */
  @IsOptional() @IsDateString()
  cerradaDesde?: string;

  @IsOptional() @IsDateString()
  cerradaHasta?: string;

  /** Área o planta de la máquina. */
  @IsOptional() @IsString() @MaxLength(100)
  area?: string;
}

export class CreatePlanDto {
  /** Plan de una máquina… */
  @IsOptional() @IsUUID()
  activoId?: string;

  /** …o plan por tipo de equipo: se aplica a todas las máquinas de ese modelo. */
  @IsOptional() @IsUUID()
  modeloId?: string;

  @IsString() @MinLength(3) @MaxLength(150)
  nombre: string;

  /** Indicaciones adicionales (texto libre, opcional). */
  @IsOptional() @IsString() @MaxLength(4000)
  tareas?: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(365)
  frecuenciaValor: number;

  @IsEnum(UnidadFrecuencia)
  frecuenciaUnidad: UnidadFrecuencia;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90)
  diasAviso?: number;

  /** Prioridad de sus órdenes (D-31). */
  @IsOptional() @IsEnum(Prioridad)
  prioridad?: Prioridad;

  /** Tareas del catálogo, en el orden en que se hacen. */
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsUUID('all', { each: true })
  tareaIds?: string[];

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

  @IsOptional() @IsEnum(Prioridad)
  prioridad?: Prioridad;

  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsUUID('all', { each: true })
  tareaIds?: string[];

  @IsOptional() @IsBoolean()
  vigente?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PartQtyDto)
  repuestos?: PartQtyDto[];
}

/** Tarea del catálogo de mantenimiento (D-31). */
export class CreateTaskDto {
  @IsString() @MinLength(3) @MaxLength(150)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(60)
  grupo?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  descripcion?: string | null;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(150)
  nombre?: string;

  @IsOptional() @IsString() @MaxLength(60)
  grupo?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  descripcion?: string | null;

  @IsOptional() @IsBoolean()
  activa?: boolean;
}
