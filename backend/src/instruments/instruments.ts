import {
  BadRequestException, Body, ConflictException, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Res,
  StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { validateUpload } from '../common/files';
import { Calibration, Instrument, TIPOS_INSTRUMENTO, TipoInstrumento } from './instrument.entities';

const LIMITE_MULTER = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024 + 1;
/** Días antes del vencimiento en que una calibración se considera "por vencer". */
export const DIAS_AVISO_CALIBRACION = 30;
const vacio = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

export class InstrumentDto {
  @IsString() @Matches(/^[A-Za-z0-9._/-]{2,40}$/, { message: 'Código inválido: use letras, números, punto, guion o barra (2 a 40)' })
  codigo: string;

  @IsString() @MinLength(2) @MaxLength(150)
  nombre: string;

  @IsIn(TIPOS_INSTRUMENTO as unknown as string[])
  tipo: TipoInstrumento;

  @IsOptional() @IsString() @MaxLength(100)
  marca?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  modelo?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  serie?: string | null;

  @IsString() @MinLength(2) @MaxLength(100)
  area: string;

  @IsOptional() @IsString() @MaxLength(150)
  ubicacion?: string | null;

  @IsOptional() @IsString() @MaxLength(120)
  rango?: string | null;

  @Type(() => Number) @IsInt() @Min(1) @Max(60)
  frecuenciaMeses: number;
}

export class UpdateInstrumentDto extends InstrumentDto {
  @IsOptional() @IsBoolean()
  vigente?: boolean;
}

/** Llega como formulario (multipart) porque puede traer el certificado. */
export class CalibrationDto {
  @IsDateString()
  fecha: string;

  @IsOptional() @Transform(vacio) @IsDateString()
  venceEn?: string;

  @IsString() @MinLength(2) @MaxLength(150)
  laboratorio: string;

  @IsOptional() @IsString() @MaxLength(80)
  numeroCertificado?: string;

  @IsIn(['APTO', 'NO_APTO'])
  resultado: 'APTO' | 'NO_APTO';

  @IsOptional() @IsString() @MaxLength(2000)
  observaciones?: string;
}

const sumarMeses = (fecha: string, meses: number) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(d, ultimo));
  return f.toISOString().slice(0, 10);
};
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TZ ?? 'America/Bogota' }).format(new Date());

export type EstadoCalibracion = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA' | 'SIN_CALIBRAR' | 'NO_APTO';

/** Estado de calibración de un instrumento según su última calibración. */
export function estadoCalibracion(ultima: { venceEn: string; resultado: string } | null, hoyStr = hoy()): EstadoCalibracion {
  if (!ultima) return 'SIN_CALIBRAR';
  if (ultima.resultado === 'NO_APTO') return 'NO_APTO';
  if (ultima.venceEn < hoyStr) return 'VENCIDA';
  const dias = (Date.parse(ultima.venceEn) - Date.parse(hoyStr)) / 86_400_000;
  return dias <= DIAS_AVISO_CALIBRACION ? 'POR_VENCER' : 'VIGENTE';
}

/**
 * Calibración de instrumentos de medición (exigencia BPM/INVIMA): termómetros, luxómetro, básculas…
 * Cada calibración guarda laboratorio, certificado y resultado, y no se puede modificar (D-26).
 */
@Injectable()
export class InstrumentsService {
  private readonly dir: string;
  private readonly maxBytes: number;

  constructor(private readonly ds: DataSource, private readonly audit: AuditService, config: ConfigService) {
    this.dir = resolve(config.get('UPLOADS_DIR', './uploads'), 'calibraciones');
    this.maxBytes = Number(config.get('MAX_UPLOAD_MB', 20)) * 1024 * 1024;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  async listar() {
    const lista = await this.ds.getRepository(Instrument).find({ order: { area: 'ASC', codigo: 'ASC' } });
    const ultimas: Array<{ instrumento_id: string; fecha: string; vence_en: string; resultado: string; laboratorio: string }> = await this.ds.query(
      `SELECT DISTINCT ON (instrumento_id) instrumento_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(vence_en, 'YYYY-MM-DD') AS vence_en, resultado, laboratorio
         FROM calibraciones ORDER BY instrumento_id, fecha DESC, creado_en DESC`,
    );
    const porId = new Map(ultimas.map((u) => [u.instrumento_id, { fecha: u.fecha, venceEn: u.vence_en, resultado: u.resultado, laboratorio: u.laboratorio }]));
    const h = hoy();
    return lista.map((i) => {
      const ultima = porId.get(i.id) ?? null;
      return { ...i, ultima, estado: estadoCalibracion(ultima, h) };
    });
  }

  async obtener(id: string) {
    const i = await this.ds.getRepository(Instrument).findOne({ where: { id } });
    if (!i) throw new NotFoundException('Instrumento no encontrado');
    const calibraciones = await this.ds.getRepository(Calibration).createQueryBuilder('c')
      .leftJoin('c.usuario', 'u').addSelect(['u.id', 'u.nombre'])
      .where('c.instrumentoId = :id', { id }).orderBy('c.fecha', 'DESC').addOrderBy('c.creadoEn', 'DESC').getMany();
    return { ...i, calibraciones, estado: estadoCalibracion(calibraciones[0] ?? null) };
  }

  async crear(dto: InstrumentDto, actor: SessionUser) {
    const codigo = dto.codigo.trim().toUpperCase();
    if (await this.ds.getRepository(Instrument).exists({ where: { codigo } })) throw new ConflictException(`Ya existe un instrumento con el código ${codigo}`);
    return this.ds.transaction(async (em) => {
      const i = await em.getRepository(Instrument).save({ ...this.limpiar(dto), codigo });
      await this.audit.log({ usuarioId: actor.id, accion: 'INSTRUMENTO_CREADO', entidad: 'instrumento', entidadId: i.id, detalle: { codigo, nombre: i.nombre } }, em);
      return i;
    });
  }

  async actualizar(id: string, dto: UpdateInstrumentDto, actor: SessionUser) {
    const actual = await this.ds.getRepository(Instrument).findOne({ where: { id } });
    if (!actual) throw new NotFoundException('Instrumento no encontrado');
    const codigo = dto.codigo.trim().toUpperCase();
    if (codigo !== actual.codigo && (await this.ds.getRepository(Instrument).exists({ where: { codigo } }))) throw new ConflictException(`Ya existe un instrumento con el código ${codigo}`);
    await this.ds.transaction(async (em) => {
      await em.getRepository(Instrument).update(id, { ...this.limpiar(dto), codigo, ...(dto.vigente !== undefined ? { vigente: dto.vigente } : {}) });
      await this.audit.log({ usuarioId: actor.id, accion: 'INSTRUMENTO_ACTUALIZADO', entidad: 'instrumento', entidadId: id, detalle: { codigo } }, em);
    });
    return this.obtener(id);
  }

  async registrarCalibracion(id: string, dto: CalibrationDto, file: Express.Multer.File | undefined, actor: SessionUser) {
    const i = await this.ds.getRepository(Instrument).findOne({ where: { id } });
    if (!i) throw new NotFoundException('Instrumento no encontrado');
    const fecha = dto.fecha.slice(0, 10);
    if (fecha > hoy()) throw new BadRequestException('La fecha de calibración no puede ser futura');
    const venceEn = dto.venceEn?.slice(0, 10) || sumarMeses(fecha, i.frecuenciaMeses);
    if (venceEn <= fecha) throw new BadRequestException('El vencimiento debe ser posterior a la fecha de calibración');
    if (dto.resultado === 'NO_APTO' && (dto.observaciones?.trim().length ?? 0) < 5) {
      throw new BadRequestException('Si el instrumento no es apto, explique en observaciones qué se hará (ajuste, cambio, retiro)');
    }
    let archivo: { ruta: string; nombre: string; mime: string } | null = null;
    if (file) {
      const tipo = validateUpload(file, this.maxBytes, ['application/pdf', 'image/jpeg', 'image/png']);
      const ruta = `${randomUUID()}${tipo.ext}`;
      await writeFile(join(this.dir, ruta), file.buffer);
      archivo = { ruta, nombre: file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 200) || `certificado${tipo.ext}`, mime: file.mimetype };
    }
    try {
      return await this.ds.transaction(async (em) => {
        const c = await em.getRepository(Calibration).save({
          instrumentoId: id, fecha, venceEn, laboratorio: dto.laboratorio.trim(), numeroCertificado: dto.numeroCertificado?.trim() || null,
          resultado: dto.resultado, observaciones: dto.observaciones?.trim() || null,
          archivoRuta: archivo?.ruta ?? null, archivoNombre: archivo?.nombre ?? null, archivoMime: archivo?.mime ?? null, usuarioId: actor.id,
        });
        await this.audit.log({
          usuarioId: actor.id, accion: 'CALIBRACION_REGISTRADA', entidad: 'instrumento', entidadId: id,
          detalle: { codigo: i.codigo, fecha, venceEn, resultado: dto.resultado, certificado: c.numeroCertificado },
        }, em);
        const { archivoRuta: _r, ...resto } = c;
        return resto;
      });
    } catch (e) {
      if (archivo) await unlink(join(this.dir, archivo.ruta)).catch(() => undefined);
      throw e;
    }
  }

  async certificado(calibracionId: string) {
    const c = await this.ds.getRepository(Calibration).createQueryBuilder('c').addSelect('c.archivoRuta').where('c.id = :calibracionId', { calibracionId }).getOne();
    if (!c?.archivoRuta) throw new NotFoundException('Esta calibración no tiene certificado adjunto');
    const ruta = join(this.dir, c.archivoRuta);
    if (!existsSync(ruta)) throw new NotFoundException('El archivo no está disponible en el servidor');
    return { c, stream: createReadStream(ruta) };
  }

  private limpiar(dto: InstrumentDto) {
    const t = (v?: string | null) => (v?.trim() ? v.trim() : null);
    return {
      nombre: dto.nombre.trim(), tipo: dto.tipo, marca: t(dto.marca), modelo: t(dto.modelo), serie: t(dto.serie), area: dto.area.trim(),
      ubicacion: t(dto.ubicacion), rango: t(dto.rango), frecuenciaMeses: dto.frecuenciaMeses,
    };
  }
}

/** Instrumentos de medición y sus calibraciones. Todos consultan; registra el administrador (y el técnico, las calibraciones). */
@Controller('instrumentos')
export class InstrumentsController {
  constructor(private readonly svc: InstrumentsService) {}

  @Get()
  listar() {
    return this.svc.listar();
  }

  @Get('calibraciones/:id/certificado')
  async certificado(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { c, stream } = await this.svc.certificado(id);
    res.set({
      'Content-Type': c.archivoMime ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(c.archivoNombre ?? 'certificado')}`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(stream);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.obtener(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  crear(@Body() dto: InstrumentDto, @CurrentUser() actor: SessionUser) {
    return this.svc.crear(dto, actor);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInstrumentDto, @CurrentUser() actor: SessionUser) {
    return this.svc.actualizar(id, dto, actor);
  }

  @Post(':id/calibraciones')
  @Roles(Rol.ADMIN, Rol.TECNICO)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: LIMITE_MULTER, files: 1 } }))
  calibrar(
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: CalibrationDto,
    @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() actor: SessionUser,
  ) {
    return this.svc.registrarCalibracion(id, dto, file, actor);
  }
}
