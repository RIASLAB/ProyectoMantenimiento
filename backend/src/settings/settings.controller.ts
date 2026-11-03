import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { SettingsService } from './settings.service';

class SetAutorizadorDto {
  @IsUUID()
  usuarioId: string;
}

class SetTarifaDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000)
  valor: number;
}

class FormatoDto {
  @IsString() @MinLength(3) @MaxLength(150)
  nombre: string;

  @IsString() @MinLength(2) @MaxLength(40)
  codigo: string;

  @IsString() @MinLength(1) @MaxLength(20)
  version: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  fechaElaboracion: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  fechaActualizacion: string | null;
}

@Controller('parametros')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('autorizador')
  getAutorizador() {
    return this.settings.getAutorizador();
  }

  @Put('autorizador')
  @Roles(Rol.ADMIN)
  setAutorizador(@Body() dto: SetAutorizadorDto, @CurrentUser() actor: SessionUser) {
    return this.settings.setAutorizador(dto.usuarioId, actor);
  }

  @Get('tarifa-hora')
  @Roles(Rol.ADMIN, Rol.AUTORIZADOR)
  async getTarifa() {
    return { tarifaHora: await this.settings.getTarifaHora() };
  }

  /** Código, versión y fechas de cada formato impreso. Todos los usuarios los leen (van en el encabezado). */
  @Get('formatos')
  getFormatos() {
    return this.settings.getFormatos();
  }

  @Put('formatos/:clave')
  @Roles(Rol.ADMIN)
  setFormato(@Param('clave') clave: string, @Body() dto: FormatoDto, @CurrentUser() actor: SessionUser) {
    if (!/^[A-Z_]{2,30}(:[^:]{2,100})?$/.test(clave)) throw new BadRequestException('Clave de formato inválida');
    return this.settings.setFormato(clave, {
      nombre: dto.nombre.trim(), codigo: dto.codigo.trim(), version: dto.version.trim(),
      fechaElaboracion: dto.fechaElaboracion ?? null, fechaActualizacion: dto.fechaActualizacion ?? null,
    }, actor);
  }

  @Put('tarifa-hora')
  @Roles(Rol.ADMIN)
  setTarifa(@Body() dto: SetTarifaDto, @CurrentUser() actor: SessionUser) {
    return this.settings.setTarifaHora(dto.valor, actor);
  }
}
