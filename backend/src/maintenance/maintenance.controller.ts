import {
  Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { MomentoFoto, Rol } from '../common/enums';
import {
  AssignDto, CancelDto, CloseOrderDto, CreatePlanDto, ListOrdersQuery, NoteDto, PlannedPartsDto, ReportFaultDto, UpdatePlanDto,
} from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

const LIMITE_MULTER = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024 + 1;

@Controller('ordenes')
export class WorkOrdersController {
  constructor(private readonly svc: MaintenanceService) {}

  @Get()
  list(@Query() q: ListOrdersQuery, @CurrentUser() actor: SessionUser) {
    return this.svc.list(q, actor);
  }

  @Get('resumen')
  @Roles(Rol.ADMIN, Rol.AUTORIZADOR, Rol.TECNICO)
  resumen() {
    return this.svc.resumen();
  }

  @Get('fotos/:fotoId/archivo')
  async foto(@Param('fotoId', ParseUUIDPipe) fotoId: string, @CurrentUser() actor: SessionUser, @Res({ passthrough: true }) res: Response) {
    const { foto, stream } = await this.svc.abrirFoto(fotoId, actor);
    res.set({ 'Content-Type': foto.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
    return new StreamableFile(stream);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: SessionUser) {
    return this.svc.get(id, actor);
  }

  /** Reporte de falla: cualquier rol (MNT-01). */
  @Post()
  reportar(@Body() dto: ReportFaultDto, @CurrentUser() actor: SessionUser) {
    return this.svc.reportarFalla(dto, actor);
  }

  @Post(':id/asignar')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  asignar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto, @CurrentUser() actor: SessionUser) {
    return this.svc.asignar(id, dto, actor);
  }

  @Post(':id/iniciar')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  iniciar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: SessionUser) {
    return this.svc.iniciar(id, actor);
  }

  @Post(':id/esperar-repuesto')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  esperar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto, @CurrentUser() actor: SessionUser) {
    return this.svc.esperarRepuesto(id, dto.nota, actor);
  }

  @Post(':id/reanudar')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  reanudar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: SessionUser) {
    return this.svc.reanudar(id, actor);
  }

  @Post(':id/cerrar')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseOrderDto, @CurrentUser() actor: SessionUser) {
    return this.svc.cerrar(id, dto, actor);
  }

  @Post(':id/cancelar')
  @Roles(Rol.ADMIN)
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto, @CurrentUser() actor: SessionUser) {
    return this.svc.cancelar(id, dto.motivo, actor);
  }

  @Put(':id/repuestos')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  repuestos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PlannedPartsDto, @CurrentUser() actor: SessionUser) {
    return this.svc.setRepuestosPlanificados(id, dto.repuestos, actor);
  }

  @Post(':id/fotos')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: LIMITE_MULTER, files: 1 } }))
  subirFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('momento', new ParseEnumPipe(MomentoFoto)) momento: MomentoFoto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: SessionUser,
  ) {
    return this.svc.agregarFoto(id, momento, file, actor);
  }
}

@Controller('planes')
@Roles(Rol.ADMIN, Rol.AUTORIZADOR, Rol.TECNICO)
export class PlansController {
  constructor(private readonly svc: MaintenanceService) {}

  @Get()
  list(@Query('activoId') activoId?: string) {
    return this.svc.listPlanes(activoId);
  }

  @Post()
  @Roles(Rol.ADMIN)
  crear(@Body() dto: CreatePlanDto, @CurrentUser() actor: SessionUser) {
    return this.svc.crearPlan(dto, actor);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto, @CurrentUser() actor: SessionUser) {
    return this.svc.actualizarPlan(id, dto, actor);
  }
}

@Controller('activos')
export class AssetHistoryController {
  constructor(private readonly svc: MaintenanceService) {}

  @Get(':id/historial')
  historial(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.historialActivo(id);
  }
}
