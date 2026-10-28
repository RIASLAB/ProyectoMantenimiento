import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { CreateModelDto, ResumenQuery, UpdateModelDto } from './equipment.dto';
import { EquipmentService } from './equipment.service';

/** Tipos de equipo. Todos los consultan (las pantallas de órdenes muestran su lista de materiales); el administrador los edita. */
@Controller('tipos-equipo')
export class EquipmentController {
  constructor(private readonly svc: EquipmentService) {}

  @Get()
  listar() {
    return this.svc.listModelos();
  }

  @Get('categorias')
  categorias() {
    return this.svc.listCategorias();
  }

  @Get('resumen')
  @Roles(Rol.ADMIN, Rol.AUTORIZADOR, Rol.TECNICO)
  resumen(@Query() q: ResumenQuery) {
    return this.svc.resumen(q);
  }

  /** Mismo resumen en CSV (Excel). */
  @Get('resumen/exportar')
  @Roles(Rol.ADMIN, Rol.AUTORIZADOR)
  async exportar(@Query() q: ResumenQuery, @Res({ passthrough: true }) res: Response) {
    const r = await this.svc.resumen(q);
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };
    const lineas = [['Categoría', 'Modelo', 'Área', 'Total', 'Operativos', 'En mantenimiento', 'Fuera de servicio', 'En bodega', 'Dados de baja']]
      .concat(r.filas.map((f) => [f.categoria, f.modelo ?? '', f.area, f.total, f.operativos, f.enMantenimiento, f.fueraDeServicio, f.enBodega, f.dadosDeBaja].map(esc)))
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="equipos-por-area.csv"' });
    return '﻿' + lineas.join('\r\n');
  }

  @Get(':id')
  ver(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getModelo(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  crear(@Body() dto: CreateModelDto, @CurrentUser() actor: SessionUser) {
    return this.svc.crearModelo(dto, actor);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateModelDto, @CurrentUser() actor: SessionUser) {
    return this.svc.actualizarModelo(id, dto, actor);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  eliminar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: SessionUser) {
    return this.svc.eliminarModelo(id, actor);
  }
}
