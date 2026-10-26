import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import {
  CreateChecklistDto, CreateControlPointDto, CreateTemperatureDto, CreateTemplateDto, RecordsQuery, UpdateControlPointDto, UpdateTemplateDto,
  VoidDto,
} from './quality.dto';
import { QualityService } from './quality.service';

/** Calidad HACCP/BPM. Registrar es para todos los roles; configurar y anular, solo administradores. */
@Controller('calidad')
export class QualityController {
  constructor(private readonly svc: QualityService) {}

  @Get('resumen')
  resumen() {
    return this.svc.resumen();
  }

  @Get('puntos')
  puntos(@Query('incluirInactivos') inc?: string) {
    return this.svc.listPuntos(inc === 'true');
  }

  @Post('puntos')
  @Roles(Rol.ADMIN)
  crearPunto(@Body() dto: CreateControlPointDto, @CurrentUser() actor: SessionUser) {
    return this.svc.crearPunto(dto, actor);
  }

  @Patch('puntos/:id')
  @Roles(Rol.ADMIN)
  actualizarPunto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateControlPointDto, @CurrentUser() actor: SessionUser) {
    return this.svc.actualizarPunto(id, dto, actor);
  }

  @Get('temperaturas')
  temperaturas(@Query() q: RecordsQuery) {
    return this.svc.listTemperaturas(q);
  }

  @Post('temperaturas')
  registrarTemperatura(@Body() dto: CreateTemperatureDto, @CurrentUser() actor: SessionUser) {
    return this.svc.registrarTemperatura(dto, actor);
  }

  @Get('plantillas')
  plantillas(@Query('incluirInactivas') inc?: string) {
    return this.svc.listPlantillas(inc === 'true');
  }

  @Get('plantillas/:id')
  plantilla(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getPlantilla(id);
  }

  @Post('plantillas')
  @Roles(Rol.ADMIN)
  crearPlantilla(@Body() dto: CreateTemplateDto, @CurrentUser() actor: SessionUser) {
    return this.svc.crearPlantilla(dto, actor);
  }

  @Patch('plantillas/:id')
  @Roles(Rol.ADMIN)
  actualizarPlantilla(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto, @CurrentUser() actor: SessionUser) {
    return this.svc.actualizarPlantilla(id, dto, actor);
  }

  @Get('checklists')
  checklists(@Query() q: RecordsQuery) {
    return this.svc.listChecklists(q);
  }

  @Post('checklists')
  registrarChecklist(@Body() dto: CreateChecklistDto, @CurrentUser() actor: SessionUser) {
    return this.svc.registrarChecklist(dto, actor);
  }

  @Post('anulaciones')
  @Roles(Rol.ADMIN)
  anular(@Body() dto: VoidDto, @CurrentUser() actor: SessionUser) {
    return this.svc.anular(dto, actor);
  }

  @Get('exportar/:tipo')
  @Roles(Rol.ADMIN, Rol.AUTORIZADOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportar(@Param('tipo') tipo: string, @Query() q: RecordsQuery, @Res({ passthrough: true }) res: Response) {
    const nombre = tipo === 'checklists' ? 'checklists' : 'temperaturas';
    res.set('Content-Disposition', `attachment; filename="registros-${nombre}.csv"`);
    return this.svc.exportarCsv(nombre, q);
  }
}
