import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CurrentUser, SessionUser } from '../common/auth.decorators';
import { NotificationsService } from './notifications.service';

class ListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limite?: number;

  @IsOptional() @IsDateString()
  antesDe?: string;
}

class PushKeys {
  @IsString() @MaxLength(200)
  p256dh: string;

  @IsString() @MaxLength(100)
  auth: string;
}

class SubscribeDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1000)
  endpoint: string;

  @ValidateNested() @Type(() => PushKeys)
  keys: PushKeys;
}

class UnsubscribeDto {
  @IsString() @MaxLength(1000)
  endpoint: string;
}

/** NOT-02: cada usuario ve y maneja solo sus propias notificaciones. */
@Controller('notificaciones')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  listar(@Query() q: ListQuery, @CurrentUser() u: SessionUser) {
    return this.svc.listar(u, q.limite, q.antesDe);
  }

  @Get('contador')
  async contador(@CurrentUser() u: SessionUser) {
    return { noLeidas: await this.svc.contar(u) };
  }

  @Post('leidas')
  @HttpCode(200)
  todas(@CurrentUser() u: SessionUser) {
    return this.svc.marcarTodas(u);
  }

  @Post(':id/leida')
  @HttpCode(200)
  leida(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: SessionUser) {
    return this.svc.marcarLeida(id, u);
  }

  @Get('push')
  push() {
    return this.svc.configuracionPush();
  }

  @Post('push')
  @HttpCode(200)
  suscribir(@Body() dto: SubscribeDto, @Headers('user-agent') agente: string | undefined, @CurrentUser() u: SessionUser) {
    return this.svc.suscribir(dto, agente, u);
  }

  @Post('push/baja')
  @HttpCode(200)
  baja(@Body() dto: UnsubscribeDto, @CurrentUser() u: SessionUser) {
    return this.svc.desuscribir(dto.endpoint, u);
  }

  @Post('push/prueba')
  @HttpCode(200)
  prueba(@CurrentUser() u: SessionUser) {
    return this.svc.prueba(u);
  }
}
