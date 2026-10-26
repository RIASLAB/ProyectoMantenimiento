import { Body, Controller, Get, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Max, Min } from 'class-validator';
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

  @Put('tarifa-hora')
  @Roles(Rol.ADMIN)
  setTarifa(@Body() dto: SetTarifaDto, @CurrentUser() actor: SessionUser) {
    return this.settings.setTarifaHora(dto.valor, actor);
  }
}
