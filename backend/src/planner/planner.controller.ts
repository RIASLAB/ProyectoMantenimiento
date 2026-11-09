import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { PlannerService } from './planner.service';

/** Planeador anual de mantenimiento (AC-PMT-CR01, D-36). */
@Controller('planeador')
@Roles(Rol.ADMIN, Rol.AUTORIZADOR, Rol.TECNICO)
export class PlannerController {
  constructor(private readonly svc: PlannerService) {}

  @Get('areas')
  areas() {
    return this.svc.areas();
  }

  @Get()
  planeador(@Query('area') area: string, @Query('anio') anio?: string, @Query('corte') corte?: string) {
    return this.svc.planeador(area, anio, corte);
  }
}
