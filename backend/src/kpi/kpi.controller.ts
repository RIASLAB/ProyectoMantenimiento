import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { hoyLocal, KpiService } from './kpi.service';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

class KpiQuery {
  @IsOptional() @Matches(FECHA, { message: 'desde debe tener el formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional() @Matches(FECHA, { message: 'hasta debe tener el formato AAAA-MM-DD' })
  hasta?: string;
}

class MetasDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) disponibilidad?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100_000) mtbf?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100_000) mttr?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) cumplimiento?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) rotacion?: number | null;
}

class ParametrosDto {
  @IsArray() @ArrayMinSize(1, { message: 'Seleccione al menos un día de producción' }) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  dias: number[];

  @Matches(HORA, { message: 'Hora de inicio inválida (HH:MM)' })
  horaInicio: string;

  @Matches(HORA, { message: 'Hora de fin inválida (HH:MM)' })
  horaFin: string;

  @ValidateNested() @Type(() => MetasDto)
  metas: MetasDto;
}

/** KPI-01 a KPI-07: indicadores para Dirección y el administrador. */
@Controller('indicadores')
@Roles(Rol.ADMIN, Rol.AUTORIZADOR)
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  /** Por defecto, los últimos 30 días hasta hoy. */
  @Get()
  calcular(@Query() q: KpiQuery) {
    const hasta = q.hasta ?? hoyLocal();
    const desde = q.desde ?? new Date(Date.parse(`${hasta}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    return this.kpi.calcular(desde, hasta);
  }

  @Get('parametros')
  parametros() {
    return this.kpi.parametros();
  }

  @Put('parametros')
  @Roles(Rol.ADMIN)
  guardar(@Body() dto: ParametrosDto, @CurrentUser() actor: SessionUser) {
    return this.kpi.guardarParametros({ ...dto, metas: { disponibilidad: null, mtbf: null, mttr: null, cumplimiento: null, rotacion: null, ...dto.metas } }, actor);
  }
}
