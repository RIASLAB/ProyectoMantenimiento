import { BadRequestException, Body, Controller, Get, Param, ParseEnumPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { ImportService, MAX_BYTES, TipoCarga } from './import.service';
import { HojaVidaService, MAX_BYTES_HV } from './hoja-vida.service';

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

const SUBIDA_HV = FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES_HV + 1, files: 1 } });

/** D-34: carga de la hoja de vida de maquinaria (AC-PMT-FR05) en Excel. Solo el administrador. */
@Controller('hojas-de-vida')
@Roles(Rol.ADMIN)
export class HojaVidaController {
  constructor(private readonly svc: HojaVidaService) {}

  /** Lee el archivo y muestra lo que se va a crear o actualizar, sin guardar nada. */
  @Post('revisar')
  @UseInterceptors(SUBIDA_HV)
  revisar(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.svc.analizar(file);
  }

  /** Carga todas las hojas del archivo; si alguna tiene un error no carga nada. */
  @Post('cargar')
  @UseInterceptors(SUBIDA_HV)
  cargar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('fechas') fechas: string | undefined,
    @Body('crearRepuestos') crearRepuestos: string | undefined,
    @CurrentUser() actor: SessionUser,
  ) {
    return this.svc.cargar(file, fechas, crearRepuestos !== 'false', actor);
  }
}
