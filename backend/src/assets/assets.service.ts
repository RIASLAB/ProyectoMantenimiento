import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { EstadoActivo } from '../common/enums';
import { validateUpload } from '../common/files';
import { AssetDocument } from './asset-document.entity';
import { Asset } from './asset.entity';
import { CreateAssetDto, UpdateAssetDto } from './assets.dto';

@Injectable()
export class AssetsService {
  private readonly dir: string;
  readonly maxBytes: number;

  constructor(
    @InjectRepository(Asset) private readonly repo: Repository<Asset>,
    @InjectRepository(AssetDocument) private readonly docs: Repository<AssetDocument>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get('UPLOADS_DIR', './uploads'), 'activos');
    this.maxBytes = Number(config.get('MAX_UPLOAD_MB', 20)) * 1024 * 1024;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  list(f: { q?: string; estado?: EstadoActivo; area?: string }) {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.area').addOrderBy('a.codigo');
    if (f.q) {
      qb.andWhere('(a.codigo ILIKE :q OR a.nombre ILIKE :q OR a.modelo ILIKE :q OR a.fabricante ILIKE :q OR a.codigoSap ILIKE :q)', {
        q: `%${f.q.trim()}%`,
      });
    }
    if (f.estado) qb.andWhere('a.estado = :estado', { estado: f.estado });
    if (f.area) qb.andWhere('a.area = :area', { area: f.area });
    return qb.getMany();
  }

  async areas(): Promise<string[]> {
    const rows = await this.repo.createQueryBuilder('a').select('DISTINCT a.area', 'area').orderBy('area').getRawMany();
    return rows.map((r) => r.area);
  }

  async get(id: string) {
    const a = await this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.documentos', 'd')
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

    return this.ds.transaction(async (em) => {
      const saved = await em.getRepository(Asset).save(em.getRepository(Asset).create({ ...this.limpiar(dto), codigo }));
      await this.audit.log({ usuarioId: actor.id, accion: 'ACTIVO_CREADO', entidad: 'activo', entidadId: saved.id, detalle: { codigo } }, em);
      return saved;
    });
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

    const detalle: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cambios)) {
      const antes = (actual as unknown as Record<string, unknown>)[k];
      if (v !== antes) detalle[k] = { antes, despues: v };
    }
    if (Object.keys(detalle).length === 0) return actual;

    return this.ds.transaction(async (em) => {
      await em.getRepository(Asset).update(id, cambios);
      await this.audit.log({ usuarioId: actor.id, accion: 'ACTIVO_ACTUALIZADO', entidad: 'activo', entidadId: id, detalle }, em);
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
