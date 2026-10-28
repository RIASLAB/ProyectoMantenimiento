import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { EstadoActivo } from '../common/enums';
import { validateUpload } from '../common/files';
import { AssetDocument } from './asset-document.entity';
import { Asset } from './asset.entity';
import { EquipmentModel } from '../equipment/equipment.entities';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { CreateAssetDto, CreateManyAssetsDto, UpdateAssetDto } from './assets.dto';

@Injectable()
export class AssetsService {
  private readonly dir: string;
  readonly maxBytes: number;

  constructor(
    @InjectRepository(Asset) private readonly repo: Repository<Asset>,
    @InjectRepository(AssetDocument) private readonly docs: Repository<AssetDocument>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly maintenance: MaintenanceService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get('UPLOADS_DIR', './uploads'), 'activos');
    this.maxBytes = Number(config.get('MAX_UPLOAD_MB', 20)) * 1024 * 1024;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  list(f: { q?: string; estado?: EstadoActivo; area?: string; modeloId?: string; categoriaId?: string }) {
    const qb = this.repo.createQueryBuilder('a')
      .leftJoin('a.modeloEquipo', 'm').addSelect(['m.id', 'm.nombre', 'm.categoriaId'])
      .leftJoin('m.categoria', 'mc').addSelect(['mc.id', 'mc.nombre'])
      .orderBy('a.area').addOrderBy('a.codigo');
    if (f.modeloId) qb.andWhere('a.modeloId = :modeloId', { modeloId: f.modeloId });
    if (f.categoriaId) qb.andWhere('m.categoriaId = :categoriaId', { categoriaId: f.categoriaId });
    if (f.q) {
      qb.andWhere('(a.codigo ILIKE :q OR a.nombre ILIKE :q OR a.modelo ILIKE :q OR a.fabricante ILIKE :q OR a.codigoSap ILIKE :q)', {
        q: `%${f.q.trim()}%`,
      });
    }
    if (f.estado) qb.andWhere('a.estado = :estado', { estado: f.estado });
    if (f.area) qb.andWhere('lower(a.area) = lower(:area)', { area: f.area });
    return qb.getMany();
  }

  async areas(): Promise<string[]> {
    // Sin repetir la misma área escrita con distintas mayúsculas.
    const rows: Array<{ area: string }> = await this.ds.query('SELECT min(area) AS area FROM activos GROUP BY lower(area) ORDER BY 1');
    return rows.map((r) => r.area);
  }

  async get(id: string) {
    const a = await this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.documentos', 'd')
      .leftJoinAndSelect('a.modeloEquipo', 'm')
      .leftJoinAndSelect('m.categoria', 'mc')
      .leftJoinAndSelect('m.materiales', 'mm')
      .leftJoin('mm.repuesto', 'mr').addSelect(['mr.id', 'mr.codigo', 'mr.descripcion', 'mr.unidad'])
      .leftJoin('d.subidoPor', 'u')
      .addSelect(['u.id', 'u.nombre'])
      .where('a.id = :id', { id })
      .orderBy('d.creadoEn', 'DESC')
      .getOne();
    if (!a) throw new NotFoundException('Máquina no encontrada');
    return a;
  }

  async create(dto: CreateAssetDto, actor: SessionUser) {
    const codigo = dto.codigo.trim().toUpperCase();
    if (await this.repo.exists({ where: { codigo } })) throw new ConflictException(`Ya existe una máquina con el código ${codigo}`);
    this.validarFechas(dto.fechaCompra, dto.fechaFinGarantia);
    if (dto.modeloId) await this.validarModelo(dto.modeloId);

    return this.ds.transaction(async (em) => {
      const datos = this.limpiar(dto);
      datos.area = await this.areaExistente(em, datos.area!);
      const saved = await em.getRepository(Asset).save(em.getRepository(Asset).create({ ...datos, codigo }));
      await this.audit.log({ usuarioId: actor.id, accion: 'ACTIVO_CREADO', entidad: 'activo', entidadId: saved.id, detalle: { codigo } }, em);
      const planes = await this.maintenance.aplicarPlanesDeTipo(em, [saved.id], actor);
      return { ...saved, planesAplicados: planes };
    });
  }

  /** Registra varios equipos iguales (ej. 10 aires acondicionados) con códigos consecutivos. */
  async createMany(dto: CreateManyAssetsDto, actor: SessionUser) {
    const { cantidad, ...base } = dto;
    const codigos = this.consecutivos(dto.codigo.trim().toUpperCase(), cantidad);
    this.validarFechas(base.fechaCompra, base.fechaFinGarantia);
    if (base.modeloId) await this.validarModelo(base.modeloId);
    const existentes = await this.repo.find({ where: { codigo: In(codigos) }, select: { codigo: true } });
    if (existentes.length) throw new ConflictException(`Ya existen los códigos: ${existentes.map((e) => e.codigo).join(', ')}`);
    // La serie es de cada equipo: no se copia.
    const datos = { ...this.limpiar(base), serie: null };

    return this.ds.transaction(async (em) => {
      datos.area = await this.areaExistente(em, datos.area!);
      const creados: Asset[] = [];
      for (const codigo of codigos) {
        const a = await em.getRepository(Asset).save(em.getRepository(Asset).create({ ...datos, codigo }));
        await this.audit.log({ usuarioId: actor.id, accion: 'ACTIVO_CREADO', entidad: 'activo', entidadId: a.id, detalle: { codigo, lote: `${codigos[0]} a ${codigos.at(-1)}` } }, em);
        creados.push(a);
      }
      const planes = await this.maintenance.aplicarPlanesDeTipo(em, creados.map((a) => a.id), actor);
      return { creados: creados.map((a) => ({ id: a.id, codigo: a.codigo })), planesAplicados: planes };
    });
  }

  /** "AA-008" × 3 → AA-008, AA-009, AA-010 (conserva los ceros a la izquierda). */
  private consecutivos(codigo: string, cantidad: number) {
    const m = /^(.*?)(\d+)$/.exec(codigo);
    if (!m) throw new BadRequestException('Para crear varios equipos el código debe terminar en número, ej. AA-001');
    const [, prefijo, num] = m;
    const inicio = Number(num);
    const codigos = Array.from({ length: cantidad }, (_, i) => `${prefijo}${String(inicio + i).padStart(num.length, '0')}`);
    const invalido = codigos.find((c) => c.length > 40);
    if (invalido) throw new BadRequestException(`El código ${invalido} es demasiado largo`);
    return codigos;
  }

  /** "bodega" se guarda como "Bodega" si esa área ya existe: así los conteos por área no se parten. */
  private async areaExistente(em: EntityManager, area: string) {
    const r: Array<{ area: string }> = await em.query('SELECT area FROM activos WHERE lower(area) = lower($1) GROUP BY area ORDER BY count(*) DESC LIMIT 1', [area.trim()]);
    return r[0]?.area ?? area.trim();
  }

  private async validarModelo(id: string) {
    if (!(await this.ds.getRepository(EquipmentModel).exists({ where: { id } }))) throw new BadRequestException('El tipo de equipo no existe');
  }

  async update(id: string, dto: UpdateAssetDto, actor: SessionUser) {
    const actual = await this.repo.findOne({ where: { id } });
    if (!actual) throw new NotFoundException('Máquina no encontrada');
    const cambios = this.limpiar(dto);
    if (dto.codigo) {
      cambios.codigo = dto.codigo.trim().toUpperCase();
      if (cambios.codigo !== actual.codigo && (await this.repo.exists({ where: { codigo: cambios.codigo } }))) {
        throw new ConflictException(`Ya existe una máquina con el código ${cambios.codigo}`);
      }
    }
    this.validarFechas(cambios.fechaCompra ?? actual.fechaCompra, cambios.fechaFinGarantia ?? actual.fechaFinGarantia);
    if (cambios.modeloId) await this.validarModelo(cambios.modeloId);

    const detalle: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cambios)) {
      const antes = (actual as unknown as Record<string, unknown>)[k];
      if (v !== antes) detalle[k] = { antes, despues: v };
    }
    if (Object.keys(detalle).length === 0) return actual;

    return this.ds.transaction(async (em) => {
      if (cambios.area) cambios.area = await this.areaExistente(em, cambios.area);
      await em.getRepository(Asset).update(id, cambios);
      await this.audit.log({ usuarioId: actor.id, accion: 'ACTIVO_ACTUALIZADO', entidad: 'activo', entidadId: id, detalle }, em);
      // Cambio de tipo: deja los planes del tipo anterior y recibe los del nuevo.
      if ('modeloId' in detalle) {
        if (actual.modeloId) await this.maintenance.desvincularPlanesDeTipo(em, id, actual.modeloId);
        await this.maintenance.aplicarPlanesDeTipo(em, [id], actor);
      }
      return em.getRepository(Asset).findOneOrFail({ where: { id } });
    });
  }

  async addDocument(activoId: string, file: Express.Multer.File | undefined, actor: SessionUser) {
    if (!(await this.repo.exists({ where: { id: activoId } }))) throw new NotFoundException('Máquina no encontrada');
    const tipo = validateUpload(file, this.maxBytes, ['application/pdf', 'image/jpeg', 'image/png']);
    file = file!;

    const archivo = `${randomUUID()}${tipo.ext}`;
    await writeFile(join(this.dir, archivo), file.buffer);
    const nombreOriginal = file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 255) || `documento${extname(archivo)}`;

    return this.ds.transaction(async (em) => {
      const doc = await em.getRepository(AssetDocument).save({
        activoId,
        nombreOriginal,
        archivo,
        mime: file.mimetype,
        tamanoBytes: file.size,
        subidoPorId: actor.id,
      });
      await this.audit.log(
        { usuarioId: actor.id, accion: 'DOCUMENTO_ADJUNTADO', entidad: 'activo', entidadId: activoId, detalle: { documento: nombreOriginal } },
        em,
      );
      const { archivo: _omit, ...publico } = doc;
      return publico;
    });
  }

  /** Elimina un documento adjuntado por error o reemplazado. Queda en la bitácora con su nombre. */
  async deleteDocument(docId: string, actor: SessionUser) {
    const doc = await this.docs.createQueryBuilder('d').addSelect('d.archivo').where('d.id = :docId', { docId }).getOne();
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.ds.transaction(async (em) => {
      await em.getRepository(AssetDocument).delete(doc.id);
      await this.audit.log(
        { usuarioId: actor.id, accion: 'DOCUMENTO_ELIMINADO', entidad: 'activo', entidadId: doc.activoId, detalle: { documento: doc.nombreOriginal } },
        em,
      );
    });
    await unlink(join(this.dir, doc.archivo)).catch(() => undefined);
    return { ok: true };
  }

  async openDocument(docId: string) {
    const doc = await this.docs.createQueryBuilder('d').addSelect('d.archivo').where('d.id = :docId', { docId }).getOne();
    if (!doc) throw new NotFoundException('Documento no encontrado');
    const ruta = join(this.dir, doc.archivo);
    if (!existsSync(ruta)) throw new NotFoundException('El archivo no está disponible en el servidor');
    return { doc, stream: createReadStream(ruta) };
  }

  private validarFechas(compra?: string | null, garantia?: string | null) {
    if (compra && garantia && garantia < compra) {
      throw new BadRequestException('La fecha de fin de garantía no puede ser anterior a la fecha de compra');
    }
  }

  /** Convierte textos vacíos en null y recorta espacios. */
  private limpiar<T extends object>(dto: T): Partial<Asset> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      out[k] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
    }
    return out as Partial<Asset>;
  }
}
