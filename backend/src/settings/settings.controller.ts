import { Body, Controller, Get, Put } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { SettingsService } from './settings.service';

class SetAutorizadorDto {
  @IsUUID()
  usuarioId: string;
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
}
