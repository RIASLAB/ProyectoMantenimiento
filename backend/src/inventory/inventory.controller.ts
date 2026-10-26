import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { CreateMovementDto, CreateSparePartDto, PhysicalCountDto, UpdateSparePartDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('repuestos')
export class SparePartsController {
  constructor(private readonly inv: InventoryService) {}

  @Get()
  list(@Query('q') q?: string, @Query('bajoMinimo') bajoMinimo?: string, @Query('incluirInactivos') incluirInactivos?: string) {
    return this.inv.list({ q, bajoMinimo: bajoMinimo === 'true', incluirInactivos: incluirInactivos === 'true' });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.inv.get(id);
  }

  @Get(':id/kardex')
  @Roles(Rol.ADMIN, Rol.AUTORIZADOR)
  kardex(@Param('id', ParseUUIDPipe) id: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.inv.kardex(id, { desde, hasta });
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateSparePartDto, @CurrentUser() actor: SessionUser) {
    return this.inv.create(dto, actor);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSparePartDto, @CurrentUser() actor: SessionUser) {
    return this.inv.update(id, dto, actor);
  }
}

@Controller('inventario')
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  /** Entradas, salidas y ajustes manuales. Los consumos por OT se registrarán desde el módulo de mantenimiento. */
  @Post('movimientos')
  @Roles(Rol.ADMIN)
  movimiento(@Body() dto: CreateMovementDto, @CurrentUser() actor: SessionUser) {
    return this.inv.registrarMovimiento(dto, actor);
  }

  @Post('conteos')
  @Roles(Rol.ADMIN)
  conteo(@Body() dto: PhysicalCountDto, @CurrentUser() actor: SessionUser) {
    return this.inv.conteoFisico(dto, actor);
  }

  @Get('exportar')
  @Roles(Rol.ADMIN, Rol.AUTORIZADOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="inventario-repuestos.csv"')
  exportar() {
    return this.inv.exportCsv();
  }
}
