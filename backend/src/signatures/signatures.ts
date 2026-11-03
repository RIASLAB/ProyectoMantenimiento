import { Body, ConflictException, Controller, ForbiddenException, Get, Injectable, NotFoundException, BadRequestException, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { ENTIDADES_FIRMA, EntidadFirma, Signature } from './signature.entity';

/** Casillas de firma de cada formato. Las del jefe solo las firma un administrador o el autorizador. */
export const CASILLAS: Record<EntidadFirma, Record<string, { titulo: string; soloJefe?: boolean }>> = {
  OT: { RESPONSABLE: { titulo: 'Responsable del reporte' }, JEFE_MANTENIMIENTO: { titulo: 'Jefe de mantenimiento', soloJefe: true }, LIDER_AREA: { titulo: 'Líder de área' } },
  CHECKLIST: { REALIZO: { titulo: 'Realizó' }, VERIFICO: { titulo: 'Verificó (jefe de área)' } },
  PLANILLA: { REALIZO: { titulo: 'Realizó' }, VERIFICO: { titulo: 'Verificó', soloJefe: true } },
  ILUMINACION: { EVALUADOR: { titulo: 'Evaluador' }, REVISO: { titulo: 'Revisó', soloJefe: true } },
};
// El cuerpo JSON admite 100 KB: una firma a mano alzada pesa entre 5 y 30 KB.
const MAX_BYTES = 60 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TABLA: Record<Exclude<EntidadFirma, 'PLANILLA'>, string> = { OT: 'ordenes_trabajo', CHECKLIST: 'registros_checklist', ILUMINACION: 'mediciones_iluminacion' };

class SignDto {
  @IsIn(ENTIDADES_FIRMA as unknown as string[])
  entidad: EntidadFirma;

  @IsString() @MinLength(3) @MaxLength(150)
  entidadId: string;

  @IsString() @MaxLength(40)
  casilla: string;

  @IsString() @MinLength(3) @MaxLength(120)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(120)
  cargo?: string;

  @IsString() @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: 'La firma debe ser una imagen PNG' }) @MaxLength(90_000)
  imagen: string;
}

class ListQuery {
  @IsIn(ENTIDADES_FIRMA as unknown as string[])
  entidad: EntidadFirma;

  @IsString() @MinLength(3) @MaxLength(150)
  entidadId: string;
}

@Injectable()
export class SignaturesService {
  constructor(private readonly ds: DataSource, private readonly audit: AuditService) {}

  listar(entidad: EntidadFirma, entidadId: string) {
    return this.ds.getRepository(Signature).createQueryBuilder('f')
      .addSelect('f.imagen')
      .where('f.entidad = :entidad AND f.entidadId = :entidadId', { entidad, entidadId })
      .orderBy('f.creadoEn').getMany();
  }

  async firmar(dto: SignDto, actor: SessionUser) {
    const casilla = CASILLAS[dto.entidad][dto.casilla];
    if (!casilla) throw new BadRequestException('Esa casilla de firma no existe en el formato');
    if (casilla.soloJefe && actor.rol !== Rol.ADMIN && actor.rol !== Rol.AUTORIZADOR) {
      throw new ForbiddenException(`La firma de "${casilla.titulo}" la hace el jefe`);
    }
    const bytes = Buffer.from(dto.imagen.slice(dto.imagen.indexOf(',') + 1), 'base64');
    if (!bytes.subarray(0, 8).equals(PNG)) throw new BadRequestException('La firma debe ser una imagen PNG');
    if (bytes.length > MAX_BYTES) throw new BadRequestException('La imagen de la firma es demasiado grande');
    if (bytes.length < 200) throw new BadRequestException('La firma está vacía');
    const entidadId = await this.existe(dto.entidad, dto.entidadId);
    if (await this.ds.getRepository(Signature).exists({ where: { entidad: dto.entidad, entidadId, casilla: dto.casilla } })) {
      throw new ConflictException(`El formato ya tiene la firma de "${casilla.titulo}"`);
    }
    return this.ds.transaction(async (em) => {
      const f = await em.getRepository(Signature).save({
        entidad: dto.entidad, entidadId, casilla: dto.casilla, nombre: dto.nombre.trim(), cargo: dto.cargo?.trim() || null,
        imagen: dto.imagen, usuarioId: actor.id,
      });
      await this.audit.log({
        usuarioId: actor.id, accion: 'FORMATO_FIRMADO', entidad: 'firma', entidadId: f.id,
        detalle: { formato: dto.entidad, registro: entidadId, casilla: casilla.titulo, nombre: f.nombre },
      }, em);
      const { imagen: _i, ...resto } = f;
      return resto;
    });
  }

  /** El registro firmado debe existir. La planilla se identifica como "AAAA-MM-DD|Área" (con el área tal como está guardada). */
  private async existe(entidad: EntidadFirma, id: string): Promise<string> {
    if (entidad === 'PLANILLA') {
      const m = /^(\d{4}-\d{2}-\d{2})\|(.{2,100})$/.exec(id);
      if (!m) throw new BadRequestException('Planilla inválida');
      const [r] = await this.ds.query(
        `SELECT min(a.area) AS area FROM puntos_control p JOIN activos a ON a.id = p.activo_id WHERE lower(a.area) = lower($1)`, [m[2]],
      );
      if (!r?.area) throw new NotFoundException('No hay planilla de temperaturas para esa área');
      return `${m[1]}|${r.area}`;
    }
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new NotFoundException('Registro no encontrado');
    const [{ n }] = await this.ds.query(`SELECT count(*)::int AS n FROM ${TABLA[entidad]} WHERE id = $1`, [id]);
    if (!n) throw new NotFoundException('Registro no encontrado');
    return id;
  }
}

/** Firmas hechas en la pantalla sobre los formatos impresos. Todos las ven; las del jefe las hace un administrador o el autorizador. */
@Controller('firmas')
export class SignaturesController {
  constructor(private readonly svc: SignaturesService) {}

  @Get()
  listar(@Query() q: ListQuery) {
    return this.svc.listar(q.entidad, q.entidadId);
  }

  @Post()
  firmar(@Body() dto: SignDto, @CurrentUser() actor: SessionUser) {
    return this.svc.firmar(dto, actor);
  }
}
