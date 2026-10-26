import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { AuditService } from './audit.service';

@Controller('bitacora')
@Roles(Rol.ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('entidad') entidad?: string,
    @Query('entidadId') entidadId?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('limite') limite?: string,
    @Query('desde') desde?: string,
  ) {
    return this.audit.list({
      entidad,
      entidadId,
      usuarioId,
      limite: limite ? Number(limite) : undefined,
      desde: desde ? Number(desde) : undefined,
    });
  }
}
