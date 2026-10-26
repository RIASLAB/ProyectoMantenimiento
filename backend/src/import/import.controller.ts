import { BadRequestException, Controller, Get, Param, ParseEnumPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { ImportService, MAX_BYTES, TipoCarga } from './import.service';

const TIPO = new ParseEnumPipe<{ maquinas: 'maquinas'; repuestos: 'repuestos' }>(
  { maquinas: 'maquinas', repuestos: 'repuestos' },
  { exceptionFactory: () => new BadRequestException('Tipo de carga inválido: use maquinas o repuestos') },
);
const SUBIDA = FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES + 1, files: 1 } });

/** INT-01: carga inicial masiva desde Excel. Solo el administrador. */
@Controller('importacion')
@Roles(Rol.ADMIN)
export class ImportController {
  constructor(private readonly svc: ImportService) {}

  @Get(':tipo/plantilla')
  async plantilla(@Param('tipo', TIPO) tipo: TipoCarga, @Res({ passthrough: true }) res: Response) {
    res.set({
      'Content-Type': ImportService.XLSX_MIME,
      'Content-Disposition': `attachment; filename="plantilla-${tipo}.xlsx"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(await this.svc.plantilla(tipo));
  }

  /** Revisa el archivo y devuelve los errores por fila, sin guardar nada. */
  @Post(':tipo/validar')
  @UseInterceptors(SUBIDA)
  async validar(@Param('tipo', TIPO) tipo: TipoCarga, @UploadedFile() file: Express.Multer.File | undefined) {
    const { registros: _r, ...resumen } = await this.svc.analizar(tipo, file);
    return resumen;
  }

  /** Carga el archivo completo; si tiene algún error no carga nada. */
  @Post(':tipo')
  @UseInterceptors(SUBIDA)
  cargar(@Param('tipo', TIPO) tipo: TipoCarga, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() actor: SessionUser) {
    return this.svc.cargar(tipo, file, actor);
  }
}
