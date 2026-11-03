import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { CreatePointDto, CreateSurveyDto, RoomTypeDto, UpdatePointDto } from './lighting.dto';
import { LightingService } from './lighting.service';

/** Medición de iluminación. Todos la consultan; miden el administrador y los técnicos; configura el administrador. */
@Controller('iluminacion')
export class LightingController {
  constructor(private readonly svc: LightingService) {}

  @Get('recintos')
  recintos() {
    return this.svc.recintos();
  }

  @Post('recintos')
  @Roles(Rol.ADMIN)
  crearRecinto(@Body() dto: RoomTypeDto, @CurrentUser() actor: SessionUser) {
    return this.svc.crearRecinto(dto, actor);
  }

  @Patch('recintos/:id')
  @Roles(Rol.ADMIN)
  actualizarRecinto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomTypeDto, @CurrentUser() actor: SessionUser) {
    return this.svc.actualizarRecinto(id, dto, actor);
  }

  @Get('puntos')
  puntos(@Query('incluirInactivos') inc?: string) {
    return this.svc.puntos(inc === 'true');
  }

  @Post('puntos')
  @Roles(Rol.ADMIN)
  crearPunto(@Body() dto: CreatePointDto, @CurrentUser() actor: SessionUser) {
    return this.svc.crearPunto(dto, actor);
  }

  @Patch('puntos/:id')
  @Roles(Rol.ADMIN)
  actualizarPunto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePointDto, @CurrentUser() actor: SessionUser) {
    return this.svc.actualizarPunto(id, dto, actor);
  }

  @Get('mediciones')
  mediciones() {
    return this.svc.mediciones();
  }

  @Get('mediciones/:id')
  medicion(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.medicion(id);
  }

  @Post('mediciones')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  registrar(@Body() dto: CreateSurveyDto, @CurrentUser() actor: SessionUser) {
    return this.svc.registrar(dto, actor);
  }
}
