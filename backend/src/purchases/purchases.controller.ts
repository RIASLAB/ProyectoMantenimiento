import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { BuyDto, CreatePurchaseDto, ListPurchasesQuery, ReceiveDto, RejectDto } from './purchases.dto';
import { PurchasesService } from './purchases.service';

@Controller('compras')
@Roles(Rol.ADMIN, Rol.AUTORIZADOR, Rol.TECNICO)
export class PurchasesController {
  constructor(private readonly svc: PurchasesService) {}

  @Get()
  list(@Query() q: ListPurchasesQuery, @CurrentUser() actor: SessionUser) {
    return this.svc.list(q, actor);
  }

  @Get('resumen')
  @Roles(Rol.ADMIN, Rol.AUTORIZADOR)
  resumen() {
    return this.svc.resumen();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: SessionUser) {
    return this.svc.get(id, actor);
  }

  @Post()
  @Roles(Rol.ADMIN, Rol.TECNICO)
  crear(@Body() dto: CreatePurchaseDto, @CurrentUser() actor: SessionUser) {
    return this.svc.crear(dto, actor);
  }

  /** La aprobación se valida contra el autorizador vigente (parámetro), no solo contra el rol. */
  @Post(':id/aprobar')
  @Roles(Rol.AUTORIZADOR)
  aprobar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: SessionUser) {
    return this.svc.aprobar(id, actor);
  }

  @Post(':id/rechazar')
  @Roles(Rol.AUTORIZADOR)
  rechazar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto, @CurrentUser() actor: SessionUser) {
    return this.svc.rechazar(id, dto.motivo, actor);
  }

  @Post(':id/comprar')
  @Roles(Rol.ADMIN)
  comprar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BuyDto, @CurrentUser() actor: SessionUser) {
    return this.svc.comprar(id, dto, actor);
  }

  @Post(':id/recibir')
  @Roles(Rol.ADMIN)
  recibir(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveDto, @CurrentUser() actor: SessionUser) {
    return this.svc.recibir(id, dto, actor);
  }

  @Post(':id/cancelar')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto, @CurrentUser() actor: SessionUser) {
    return this.svc.cancelar(id, dto.motivo, actor);
  }
}
