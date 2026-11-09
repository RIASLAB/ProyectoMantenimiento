import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class CreateControlPointDto {
  @IsUUID()
  activoId: string;

  @IsString() @MinLength(3) @MaxLength(120)
  nombre: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-100) @Max(400)
  minimo?: number | null;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-100) @Max(400)
  maximo?: number | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168)
  frecuenciaHoras?: number | null;
}

export class UpdateControlPointDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  nombre?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-100) @Max(400)
  minimo?: number | null;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-100) @Max(400)
  maximo?: number | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168)
  frecuenciaHoras?: number | null;

  @IsOptional() @IsBoolean()
  vigente?: boolean;
}

export class CreateTemperatureDto {
  @IsUUID()
  puntoId: string;

  /** Obligatorio si el estado es LECTURA (o no se envía estado). */
  @ValidateIf((o: CreateTemperatureDto) => !o.estado || o.estado === 'LECTURA')
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-100) @Max(400)
  valor?: number | null;

  /** D-37: DESCANSO (D) o DANADO (F, fuera de servicio) en lugar de la temperatura. */
  @IsOptional() @IsIn(['LECTURA', 'DESCANSO', 'DANADO'])
  estado?: 'LECTURA' | 'DESCANSO' | 'DANADO';

  /** Qué tiene el equipo (obligatorio si está dañado). */
  @IsOptional() @IsString() @MaxLength(2000)
  observacion?: string;

  /** Obligatoria cuando el valor queda fuera de los límites (CAL-03); se valida en el servicio. */
  @IsOptional() @IsString() @MaxLength(2000)
  accionCorrectiva?: string;

  @IsOptional() @IsDateString()
  registradoEn?: string;

  @IsOptional() @IsUUID()
  clientId?: string;
}

export class ChecklistItemDto {
  @IsOptional() @IsString() @MaxLength(40)
  id?: string;

  @IsString() @MinLength(3) @MaxLength(300)
  texto: string;

  @IsIn(['SI_NO', 'NUMERO', 'TEXTO', 'ESCALA', 'SECCION'])
  tipo: 'SI_NO' | 'NUMERO' | 'TEXTO' | 'ESCALA' | 'SECCION';

  @IsBoolean()
  obligatorio: boolean;

  @IsOptional() @IsIn(['SI', 'NO'])
  esperado?: 'SI' | 'NO';

  @IsOptional() @IsIn(['SI_NO', 'C_NC', 'BUENO_MALO'])
  etiqueta?: 'SI_NO' | 'C_NC' | 'BUENO_MALO';

  @IsOptional() @IsBoolean()
  permiteNA?: boolean;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsNumber()
  minimo?: number | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsNumber()
  maximo?: number | null;
}

export class CreateTemplateDto {
  @IsString() @MinLength(3) @MaxLength(150)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(100)
  area?: string | null;

  @IsOptional() @IsUUID()
  activoId?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  descripcion?: string | null;

  @IsArray() @ArrayMinSize(1, { message: 'La plantilla debe tener al menos una pregunta' }) @ArrayMaxSize(150)
  @ValidateNested({ each: true }) @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];

  @IsOptional() @IsString() @MaxLength(40)
  codigo?: string | null;

  @IsOptional() @IsString() @MaxLength(20)
  version?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  fechaElaboracion?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  fechaActualizacion?: string | null;

  @IsOptional() @IsString() @MaxLength(1000)
  recomendacion?: string | null;

  /** Checklist diario: hora (0-23) desde la que se avisa si no se ha llenado. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(0) @Max(23)
  recordarHora?: number | null;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(150)
  nombre?: string;

  @IsOptional() @IsString() @MaxLength(100)
  area?: string | null;

  @IsOptional() @IsUUID()
  activoId?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  descripcion?: string | null;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(150) @ValidateNested({ each: true }) @Type(() => ChecklistItemDto)
  items?: ChecklistItemDto[];

  @IsOptional() @IsBoolean()
  vigente?: boolean;

  @IsOptional() @IsString() @MaxLength(40)
  codigo?: string | null;

  @IsOptional() @IsString() @MaxLength(20)
  version?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  fechaElaboracion?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  fechaActualizacion?: string | null;

  @IsOptional() @IsString() @MaxLength(1000)
  recomendacion?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(0) @Max(23)
  recordarHora?: number | null;
}

export class AnswerDto {
  @IsString() @MaxLength(40)
  itemId: string;

  @IsOptional()
  valor?: string | number | null;

  @IsOptional() @IsString() @MaxLength(500)
  observacion?: string;
}

export class CreateChecklistDto {
  @IsUUID()
  plantillaId: string;

  @IsOptional() @IsUUID()
  activoId?: string;

  @IsArray() @ArrayMaxSize(150) @ValidateNested({ each: true }) @Type(() => AnswerDto)
  respuestas: AnswerDto[];

  @IsOptional() @IsString() @MaxLength(2000)
  observaciones?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  accionCorrectiva?: string;

  @IsOptional() @IsDateString()
  registradoEn?: string;

  @IsOptional() @IsUUID()
  clientId?: string;
}

export class VoidDto {
  @IsIn(['TEMPERATURA', 'CHECKLIST'])
  tipo: 'TEMPERATURA' | 'CHECKLIST';

  @IsUUID()
  registroId: string;

  @IsString() @MinLength(5, { message: 'Explique el motivo de la anulación' }) @MaxLength(500)
  motivo: string;
}

export class PlanillaQuery {
  @IsDateString()
  fecha: string;

  @IsString() @MinLength(2) @MaxLength(100)
  area: string;
}

export class VerifyPlanillaDto extends PlanillaQuery {
  @IsOptional() @IsString() @MaxLength(2000)
  observaciones?: string;
}

export class RecordsQuery {
  @IsOptional() @IsDateString()
  desde?: string;

  @IsOptional() @IsDateString()
  hasta?: string;

  @IsOptional() @IsUUID()
  activoId?: string;

  @IsOptional() @IsUUID()
  puntoId?: string;

  @IsOptional() @IsUUID()
  plantillaId?: string;

  @IsOptional() @IsString()
  soloDesviaciones?: string;
}
