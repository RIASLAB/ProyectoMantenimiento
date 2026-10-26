import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { EstadoActivo, Rol } from '../common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ChecklistItemDto, CreateChecklistDto, CreateControlPointDto, CreateTemperatureDto, CreateTemplateDto, RecordsQuery,
  UpdateControlPointDto, UpdateTemplateDto, VoidDto,
} from './quality.dto';
import {
  ChecklistAnswer, ChecklistItem, ChecklistRecord, ChecklistTemplate, ControlPoint, QualityVoid, TemperatureRecord,
} from './quality.entities';

const TOLERANCIA_FUTURO_MS = 5 * 60_000;
/** Un registro offline puede llegar tarde, pero no con más de 7 días de atraso. */
const MAX_ATRASO_MS = 7 * 86_400_000;

/** Rango de fechas para consultas: por defecto los últimos 7 días. `hasta` incluye todo ese día. */
function rango(q: RecordsQuery) {
  const hasta = q.hasta ? new Date(new Date(q.hasta).getTime() + 86_400_000) : new Date(Date.now() + 60_000);
  const desde = q.desde ? new Date(q.desde) : new Date(Date.now() - 7 * 86_400_000);
  return { desde, hasta };
}

@Injectable()
export class QualityService {
  constructor(
    @InjectRepository(ControlPoint) private readonly puntos: Repository<ControlPoint>,
    @InjectRepository(TemperatureRecord) private readonly temps: Repository<TemperatureRecord>,
    @InjectRepository(ChecklistTemplate) private readonly plantillas: Repository<ChecklistTemplate>,
    @InjectRepository(ChecklistRecord) private readonly checks: Repository<ChecklistRecord>,
    @InjectRepository(QualityVoid) private readonly anulaciones: Repository<QualityVoid>,
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly notif: NotificationsService,
  ) {}

  // ======================= Puntos de control =======================

  /** Puntos con su última lectura y si están al día según la frecuencia (CAL-07). */
  async listPuntos(incluirInactivos = false) {
    const rows: Array<Record<string, unknown>> = await this.ds.query(
      `SELECT p.id, p.nombre, p.minimo, p.maximo, p.frecuencia_horas, p.vigente, p.activo_id,
              a.codigo AS activo_codigo, a.nombre AS activo_nombre, a.area AS activo_area,
              u.valor AS ultimo_valor, u.registrado_en AS ultimo_en, u.fuera_de_rango AS ultimo_fuera
       FROM puntos_control p
       JOIN activos a ON a.id = p.activo_id
       LEFT JOIN LATERAL (
         SELECT t.valor, t.registrado_en, t.fuera_de_rango FROM registros_temperatura t
         WHERE t.punto_id = p.id AND NOT EXISTS (SELECT 1 FROM anulaciones_calidad n WHERE n.tipo = 'TEMPERATURA' AND n.registro_id = t.id)
         ORDER BY t.registrado_en DESC LIMIT 1
       ) u ON true
       WHERE ($1::boolean OR p.vigente)
       ORDER BY a.area, a.codigo, p.nombre`,
      [incluirInactivos],
    );
    const ahora = Date.now();
    return rows.map((r) => {
      const frecuenciaHoras = r.frecuencia_horas === null ? null : Number(r.frecuencia_horas);
      const ultimoEn = r.ultimo_en ? new Date(r.ultimo_en as string) : null;
      const atrasado = frecuenciaHoras !== null && (!ultimoEn || ahora - ultimoEn.getTime() > frecuenciaHoras * 3_600_000);
      return {
        id: r.id, nombre: r.nombre, vigente: r.vigente, activoId: r.activo_id,
        minimo: r.minimo === null ? null : Number(r.minimo), maximo: r.maximo === null ? null : Number(r.maximo), frecuenciaHoras,
        activo: { id: r.activo_id, codigo: r.activo_codigo, nombre: r.activo_nombre, area: r.activo_area },
        ultimo: ultimoEn ? { valor: Number(r.ultimo_valor), registradoEn: ultimoEn, fueraDeRango: r.ultimo_fuera } : null,
        atrasado,
      };
    });
  }

  async crearPunto(dto: CreateControlPointDto, actor: SessionUser) {
    const activo = await this.assets.findOne({ where: { id: dto.activoId } });
    if (!activo) throw new NotFoundException('Máquina no encontrada');
    this.validarLimites(dto.minimo, dto.maximo);
    return this.ds.transaction(async (em) => {
      const p = await em.getRepository(ControlPoint).save({
        activoId: dto.activoId, nombre: dto.nombre.trim(), minimo: dto.minimo ?? null, maximo: dto.maximo ?? null, frecuenciaHoras: dto.frecuenciaHoras ?? null,
      });
      await this.audit.log({ usuarioId: actor.id, accion: 'PUNTO_CONTROL_CREADO', entidad: 'calidad', entidadId: p.id, detalle: { nombre: p.nombre, activo: activo.codigo, minimo: p.minimo, maximo: p.maximo } }, em);
      return p;
    });
  }

  async actualizarPunto(id: string, dto: UpdateControlPointDto, actor: SessionUser) {
    const p = await this.puntos.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Punto de control no encontrado');
    const cambios: Partial<ControlPoint> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
    if (dto.minimo !== undefined) cambios.minimo = dto.minimo;
    if (dto.maximo !== undefined) cambios.maximo = dto.maximo;
    if (dto.frecuenciaHoras !== undefined) cambios.frecuenciaHoras = dto.frecuenciaHoras;
    if (dto.vigente !== undefined) cambios.vigente = dto.vigente;
    this.validarLimites(cambios.minimo !== undefined ? cambios.minimo : p.minimo, cambios.maximo !== undefined ? cambios.maximo : p.maximo);
    const detalle: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cambios)) {
      const antes = (p as unknown as Record<string, unknown>)[k];
      if (v !== antes) detalle[k] = { antes, despues: v };
    }
    await this.ds.transaction(async (em) => {
      await em.getRepository(ControlPoint).update(id, cambios);
      // Cambiar un límite crítico es sensible para HACCP: queda en bitácora con el valor anterior.
      await this.audit.log({ usuarioId: actor.id, accion: 'PUNTO_CONTROL_ACTUALIZADO', entidad: 'calidad', entidadId: id, detalle }, em);
    });
    return this.puntos.findOneOrFail({ where: { id } });
  }

  // ======================= Temperaturas =======================

  /** CAL-01/02/03: registra la lectura, la evalúa contra los límites y exige acción correctiva si se sale. */
  async registrarTemperatura(dto: CreateTemperatureDto, actor: SessionUser) {
    if (dto.clientId) {
      const previo = await this.temps.findOne({ where: { clientId: dto.clientId } });
      if (previo) return { ...previo, duplicado: true };
    }
    const p = await this.puntos.findOne({ where: { id: dto.puntoId }, relations: { activo: true } });
    if (!p) throw new NotFoundException('Punto de control no encontrado');
    if (!p.vigente) throw new BadRequestException('El punto de control está inactivo');
    const registradoEn = this.momento(dto.registradoEn);

    const fuera = (p.minimo !== null && dto.valor < p.minimo) || (p.maximo !== null && dto.valor > p.maximo);
    const accion = dto.accionCorrectiva?.trim() || null;
    if (fuera && (!accion || accion.length < 5)) {
      throw new BadRequestException(`El valor ${dto.valor} °C está fuera del rango (${this.textoRango(p)}). Describa la acción correctiva.`);
    }

    return this.ds.transaction(async (em) => {
      const r = await em.getRepository(TemperatureRecord).save({
        puntoId: p.id, activoId: p.activoId, valor: dto.valor, limiteMinimo: p.minimo, limiteMaximo: p.maximo,
        fueraDeRango: fuera, accionCorrectiva: accion, registradoEn, usuarioId: actor.id, clientId: dto.clientId ?? null,
      });
      if (fuera) {
        // CAL-02: la desviación queda en bitácora (y en el resumen de calidad); las notificaciones llegan con ese módulo.
        await this.audit.log({
          usuarioId: actor.id, accion: 'TEMPERATURA_FUERA_DE_RANGO', entidad: 'calidad', entidadId: r.id,
          detalle: { punto: p.nombre, activo: p.activo.codigo, valor: dto.valor, rango: this.textoRango(p), accionCorrectiva: accion },
        }, em);
        // CAL-02 / NOT-01: aviso al responsable de calidad (asumido: los administradores).
        await this.notif.notificar(em, { roles: [Rol.ADMIN], excluir: actor.id }, {
          tipo: 'TEMPERATURA_FUERA_DE_RANGO',
          titulo: `Temperatura fuera de rango: ${p.activo.codigo} · ${String(dto.valor).replace('.', ',')} °C`,
          cuerpo: `${p.activo.nombre} — ${p.nombre} (rango ${this.textoRango(p)}). Acción: ${accion} — ${actor.nombre}`,
          enlace: '/calidad?vista=temperaturas&desviaciones=1',
        });
      }
      return { ...r, duplicado: false };
    });
  }

  async listTemperaturas(q: RecordsQuery) {
    const { desde, hasta } = rango(q);
    const qb = this.temps
      .createQueryBuilder('t')
      .leftJoin('t.punto', 'p').addSelect(['p.id', 'p.nombre'])
      .leftJoin(Asset, 'a', 'a.id = t.activoId').addSelect(['a.id', 'a.codigo', 'a.nombre'])
      .leftJoin('t.usuario', 'u').addSelect(['u.id', 'u.nombre'])
      .leftJoinAndMapOne('t.anulacion', QualityVoid, 'n', `n.tipo = 'TEMPERATURA' AND n.registroId = t.id`)
      .leftJoin('n.usuario', 'nu').addSelect(['nu.id', 'nu.nombre'])
      .where('t.registradoEn >= :desde AND t.registradoEn < :hasta', { desde, hasta })
      .orderBy('t.registradoEn', 'DESC')
      .limit(1000);
    if (q.activoId) qb.andWhere('t.activoId = :activoId', { activoId: q.activoId });
    if (q.puntoId) qb.andWhere('t.puntoId = :puntoId', { puntoId: q.puntoId });
    if (q.soloDesviaciones === 'true') qb.andWhere('t.fueraDeRango = true');
    const { entities, raw } = await qb.getRawAndEntities();
    return entities.map((t, i) => ({ ...t, activo: { id: raw[i].a_id, codigo: raw[i].a_codigo, nombre: raw[i].a_nombre } }));
  }

  // ======================= Checklists =======================

  listPlantillas(incluirInactivas = false) {
    const qb = this.plantillas.createQueryBuilder('c').leftJoin('c.activo', 'a').addSelect(['a.id', 'a.codigo', 'a.nombre']).orderBy('c.nombre');
    if (!incluirInactivas) qb.where('c.vigente = true');
    return qb.getMany();
  }

  async getPlantilla(id: string) {
    const p = await this.plantillas.findOne({ where: { id }, relations: { activo: true } });
    if (!p) throw new NotFoundException('Plantilla no encontrada');
    return p;
  }

  async crearPlantilla(dto: CreateTemplateDto, actor: SessionUser) {
    if (dto.activoId && !(await this.assets.exists({ where: { id: dto.activoId } }))) throw new NotFoundException('Máquina no encontrada');
    return this.ds.transaction(async (em) => {
      const p = await em.getRepository(ChecklistTemplate).save({
        nombre: dto.nombre.trim(), area: dto.area?.trim() || null, activoId: dto.activoId ?? null, descripcion: dto.descripcion?.trim() || null,
        items: this.normalizarItems(dto.items),
      });
      await this.audit.log({ usuarioId: actor.id, accion: 'PLANTILLA_CREADA', entidad: 'calidad', entidadId: p.id, detalle: { nombre: p.nombre, preguntas: p.items.length } }, em);
      return p;
    });
  }

  async actualizarPlantilla(id: string, dto: UpdateTemplateDto, actor: SessionUser) {
    const p = await this.getPlantilla(id);
    const cambios: Partial<ChecklistTemplate> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
    if (dto.area !== undefined) cambios.area = dto.area?.trim() || null;
    if (dto.activoId !== undefined) cambios.activoId = dto.activoId;
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion?.trim() || null;
    if (dto.vigente !== undefined) cambios.vigente = dto.vigente;
    if (dto.items) cambios.items = this.normalizarItems(dto.items);
    await this.ds.transaction(async (em) => {
      await em.getRepository(ChecklistTemplate).update(id, cambios as never);
      await this.audit.log({
        usuarioId: actor.id, accion: 'PLANTILLA_ACTUALIZADA', entidad: 'calidad', entidadId: id,
        detalle: { nombre: p.nombre, ...(dto.items ? { preguntas: { antes: p.items.length, despues: cambios.items!.length } } : {}), ...(dto.vigente !== undefined ? { vigente: dto.vigente } : {}) },
      }, em);
    });
    return this.getPlantilla(id);
  }

  /** CAL-04: evalúa cada respuesta, guarda una copia de la pregunta y exige acción correctiva si hay no conformidades. */
  async registrarChecklist(dto: CreateChecklistDto, actor: SessionUser) {
    if (dto.clientId) {
      const previo = await this.checks.findOne({ where: { clientId: dto.clientId } });
      if (previo) return { ...previo, duplicado: true };
    }
    const p = await this.getPlantilla(dto.plantillaId);
    if (!p.vigente) throw new BadRequestException('La plantilla está inactiva');
    const activoId = dto.activoId ?? p.activoId ?? null;
    if (activoId) {
      const a = await this.assets.findOne({ where: { id: activoId } });
      if (!a || a.estado === EstadoActivo.DADO_DE_BAJA) throw new BadRequestException('La máquina no existe o está dada de baja');
    }
    const registradoEn = this.momento(dto.registradoEn);
    const porItem = new Map(dto.respuestas.map((r) => [r.itemId, r.valor]));
    const desconocida = dto.respuestas.find((r) => !p.items.some((i) => i.id === r.itemId));
    if (desconocida) throw new BadRequestException('Una respuesta no corresponde a la plantilla (¿se modificó mientras la llenaba?)');

    const respuestas: ChecklistAnswer[] = p.items.map((item) => {
      const v = porItem.get(item.id);
      const vacio = v === undefined || v === null || v === '';
      if (vacio) {
        if (item.obligatorio) throw new BadRequestException(`Falta responder: ${item.texto}`);
        return { itemId: item.id, texto: item.texto, tipo: item.tipo, valor: null, conforme: true };
      }
      return { itemId: item.id, texto: item.texto, tipo: item.tipo, ...this.evaluar(item, v) };
    });
    const noConformes = respuestas.filter((r) => !r.conforme).length;
    const accion = dto.accionCorrectiva?.trim() || null;
    if (noConformes > 0 && (!accion || accion.length < 5)) {
      throw new BadRequestException(`Hay ${noConformes} punto${noConformes === 1 ? '' : 's'} no conforme${noConformes === 1 ? '' : 's'}. Describa la acción correctiva.`);
    }

    return this.ds.transaction(async (em) => {
      const r = await em.getRepository(ChecklistRecord).save({
        plantillaId: p.id, plantillaNombre: p.nombre, activoId, respuestas, noConformes,
        observaciones: dto.observaciones?.trim() || null, accionCorrectiva: accion, registradoEn, usuarioId: actor.id, clientId: dto.clientId ?? null,
      } as never) as unknown as ChecklistRecord;
      if (noConformes > 0) {
        await this.audit.log({
          usuarioId: actor.id, accion: 'CHECKLIST_NO_CONFORME', entidad: 'calidad', entidadId: r.id,
          detalle: { plantilla: p.nombre, noConformes, accionCorrectiva: accion },
        }, em);
        await this.notif.notificar(em, { roles: [Rol.ADMIN], excluir: actor.id }, {
          tipo: 'CHECKLIST_NO_CONFORME',
          titulo: `Checklist con ${noConformes} no conformidad${noConformes === 1 ? '' : 'es'}: ${p.nombre}`,
          cuerpo: `Acción: ${accion} — ${actor.nombre}`,
          enlace: '/calidad?vista=checklists&desviaciones=1',
        });
      }
      return { ...r, duplicado: false };
    });
  }

  async listChecklists(q: RecordsQuery) {
    const { desde, hasta } = rango(q);
    const qb = this.checks
      .createQueryBuilder('c')
      .leftJoin('c.activo', 'a').addSelect(['a.id', 'a.codigo', 'a.nombre'])
      .leftJoin('c.usuario', 'u').addSelect(['u.id', 'u.nombre'])
      .leftJoinAndMapOne('c.anulacion', QualityVoid, 'n', `n.tipo = 'CHECKLIST' AND n.registroId = c.id`)
      .leftJoin('n.usuario', 'nu').addSelect(['nu.id', 'nu.nombre'])
      .where('c.registradoEn >= :desde AND c.registradoEn < :hasta', { desde, hasta })
      .orderBy('c.registradoEn', 'DESC')
      .limit(500);
    if (q.activoId) qb.andWhere('c.activoId = :activoId', { activoId: q.activoId });
    if (q.plantillaId) qb.andWhere('c.plantillaId = :plantillaId', { plantillaId: q.plantillaId });
    if (q.soloDesviaciones === 'true') qb.andWhere('c.noConformes > 0');
    return qb.getMany();
  }

  // ======================= Anulación, resumen y exportación =======================

  /** CAL-05: el registro no se toca; se crea una anulación con motivo, una sola vez por registro. */
  async anular(dto: VoidDto, actor: SessionUser) {
    const repo = dto.tipo === 'TEMPERATURA' ? this.temps : this.checks;
    if (!(await (repo as Repository<{ id: string }>).exists({ where: { id: dto.registroId } }))) throw new NotFoundException('Registro no encontrado');
    if (await this.anulaciones.exists({ where: { tipo: dto.tipo, registroId: dto.registroId } })) throw new ConflictException('El registro ya fue anulado');
    return this.ds.transaction(async (em) => {
      const n = await em.getRepository(QualityVoid).save({ tipo: dto.tipo, registroId: dto.registroId, motivo: dto.motivo.trim(), usuarioId: actor.id });
      await this.audit.log({ usuarioId: actor.id, accion: 'REGISTRO_CALIDAD_ANULADO', entidad: 'calidad', entidadId: dto.registroId, detalle: { tipo: dto.tipo, motivo: n.motivo } }, em);
      return n;
    });
  }

  async resumen() {
    const [r] = await this.ds.query(
      `SELECT
         (SELECT COUNT(*) FROM registros_temperatura t WHERE t.registrado_en >= now() - interval '24 hours') AS temperaturas_24h,
         (SELECT COUNT(*) FROM registros_temperatura t WHERE t.registrado_en >= now() - interval '24 hours' AND t.fuera_de_rango
            AND NOT EXISTS (SELECT 1 FROM anulaciones_calidad n WHERE n.tipo = 'TEMPERATURA' AND n.registro_id = t.id)) AS desviaciones_24h,
         (SELECT COUNT(*) FROM registros_checklist c WHERE c.registrado_en >= now() - interval '24 hours') AS checklists_24h,
         (SELECT COUNT(*) FROM registros_checklist c WHERE c.registrado_en >= now() - interval '24 hours' AND c.no_conformes > 0
            AND NOT EXISTS (SELECT 1 FROM anulaciones_calidad n WHERE n.tipo = 'CHECKLIST' AND n.registro_id = c.id)) AS checklists_no_conformes_24h`,
    );
    const puntos = await this.listPuntos();
    return {
      temperaturas24h: Number(r.temperaturas_24h),
      desviaciones24h: Number(r.desviaciones_24h),
      checklists24h: Number(r.checklists_24h),
      checklistsNoConformes24h: Number(r.checklists_no_conformes_24h),
      puntosAtrasados: puntos.filter((p) => p.atrasado).length,
    };
  }

  /** CAL-06: exportación para auditoría, con usuario, hora de la lectura y hora de llegada al servidor. */
  async exportarCsv(tipo: string, q: RecordsQuery): Promise<string> {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
    const fecha = (d: Date) => new Date(d).toLocaleString('es-CO', { timeZone: process.env.APP_TZ ?? 'America/Bogota' });
    let header: string[];
    let lines: string[];
    if (tipo === 'checklists') {
      const items = await this.listChecklists(q);
      header = ['Fecha registro', 'Recibido en servidor', 'Checklist', 'Máquina', 'Usuario', 'No conformes', 'Respuestas', 'Acción correctiva', 'Observaciones', 'Anulado', 'Motivo anulación'];
      lines = items.map((c) => {
        const n = (c as unknown as { anulacion?: QualityVoid }).anulacion;
        const resp = c.respuestas.map((r) => `${r.conforme ? '' : '[NC] '}${r.texto}: ${r.valor ?? '—'}`).join(' | ');
        return [fecha(c.registradoEn), fecha(c.creadoEn), c.plantillaNombre, c.activo ? `${c.activo.codigo} ${c.activo.nombre}` : '', c.usuario?.nombre, c.noConformes, resp, c.accionCorrectiva, c.observaciones, n ? 'Sí' : 'No', n?.motivo].map(esc).join(';');
      });
    } else {
      const items = await this.listTemperaturas(q);
      header = ['Fecha lectura', 'Recibido en servidor', 'Máquina', 'Punto de control', 'Valor °C', 'Mínimo', 'Máximo', 'Fuera de rango', 'Acción correctiva', 'Usuario', 'Anulado', 'Motivo anulación'];
      lines = items.map((t) => {
        const n = (t as unknown as { anulacion?: QualityVoid }).anulacion;
        return [fecha(t.registradoEn), fecha(t.creadoEn), `${t.activo.codigo} ${t.activo.nombre}`, t.punto?.nombre, num(t.valor), num(t.limiteMinimo), num(t.limiteMaximo), t.fueraDeRango ? 'Sí' : 'No', t.accionCorrectiva, t.usuario?.nombre, n ? 'Sí' : 'No', n?.motivo].map(esc).join(';');
      });
    }
    return '﻿' + [header.join(';'), ...lines].join('\r\n');
  }

  // ======================= Internos =======================

  private momento(iso?: string) {
    if (!iso) return new Date();
    const d = new Date(iso);
    if (d.getTime() > Date.now() + TOLERANCIA_FUTURO_MS) throw new BadRequestException('La hora del registro no puede estar en el futuro');
    if (Date.now() - d.getTime() > MAX_ATRASO_MS) throw new BadRequestException('El registro tiene más de 7 días de atraso');
    return d;
  }

  private validarLimites(min?: number | null, max?: number | null) {
    if (min !== null && min !== undefined && max !== null && max !== undefined && min > max) {
      throw new BadRequestException('El mínimo no puede ser mayor que el máximo');
    }
  }

  private textoRango(p: { minimo: number | null; maximo: number | null }) {
    if (p.minimo !== null && p.maximo !== null) return `${p.minimo} a ${p.maximo} °C`;
    if (p.minimo !== null) return `mínimo ${p.minimo} °C`;
    if (p.maximo !== null) return `máximo ${p.maximo} °C`;
    return 'sin límites';
  }

  private normalizarItems(items: ChecklistItemDto[]): ChecklistItem[] {
    const ids = new Set<string>();
    return items.map((i) => {
      // Se conservan los id existentes para que los registros viejos sigan enlazados; los nuevos reciben uno.
      let id = i.id?.trim() || randomUUID().slice(0, 8);
      while (ids.has(id)) id = randomUUID().slice(0, 8);
      ids.add(id);
      if (i.tipo === 'NUMERO') this.validarLimites(i.minimo, i.maximo);
      return {
        id, texto: i.texto.trim(), tipo: i.tipo, obligatorio: i.obligatorio,
        ...(i.tipo === 'SI_NO' ? { esperado: i.esperado ?? 'SI' } : {}),
        ...(i.tipo === 'NUMERO' ? { minimo: i.minimo ?? null, maximo: i.maximo ?? null } : {}),
      };
    });
  }

  private evaluar(item: ChecklistItem, v: string | number | null | undefined): { valor: string | number; conforme: boolean } {
    if (item.tipo === 'SI_NO') {
      const s = String(v).toUpperCase();
      if (s !== 'SI' && s !== 'NO') throw new BadRequestException(`Responda Sí o No: ${item.texto}`);
      return { valor: s, conforme: s === (item.esperado ?? 'SI') };
    }
    if (item.tipo === 'NUMERO') {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new BadRequestException(`Debe ser un número: ${item.texto}`);
      const conforme = (item.minimo === null || item.minimo === undefined || n >= item.minimo) && (item.maximo === null || item.maximo === undefined || n <= item.maximo);
      return { valor: n, conforme };
    }
    const texto = String(v).trim().slice(0, 1000);
    return { valor: texto, conforme: true };
  }
}
