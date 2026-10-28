import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { EstadoActivo, EstadoOrden, MomentoFoto, Prioridad, Rol, TipoMovimiento, TipoOrden, UnidadFrecuencia } from '../common/enums';
import { validateUpload } from '../common/files';
import { InventoryService } from '../inventory/inventory.service';
import { SparePart } from '../inventory/spare-part.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PurchasesService } from '../purchases/purchases.service';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/user.entity';
import { AssignDto, CloseOrderDto, CreatePlanDto, ListOrdersQuery, PartQtyDto, ReportFaultDto, UpdatePlanDto } from './maintenance.dto';
import { MaintenancePlan, PlanPart, WorkOrder, WorkOrderEvent, WorkOrderLabor, WorkOrderPart, WorkOrderPhoto } from './maintenance.entities';

/** Transiciones de estado permitidas (MNT-03). */
export const TRANSICIONES: Record<EstadoOrden, EstadoOrden[]> = {
  [EstadoOrden.ABIERTA]: [EstadoOrden.ASIGNADA, EstadoOrden.CANCELADA],
  [EstadoOrden.ASIGNADA]: [EstadoOrden.EN_EJECUCION, EstadoOrden.CANCELADA],
  [EstadoOrden.EN_EJECUCION]: [EstadoOrden.ESPERANDO_REPUESTO, EstadoOrden.CERRADA, EstadoOrden.CANCELADA],
  [EstadoOrden.ESPERANDO_REPUESTO]: [EstadoOrden.EN_EJECUCION, EstadoOrden.CANCELADA],
  [EstadoOrden.CERRADA]: [],
  [EstadoOrden.CANCELADA]: [],
};

const ABIERTAS = [EstadoOrden.ABIERTA, EstadoOrden.ASIGNADA, EstadoOrden.EN_EJECUCION, EstadoOrden.ESPERANDO_REPUESTO];
const ETIQUETA_ESTADO: Record<EstadoOrden, string> = {
  ABIERTA: 'abierta', ASIGNADA: 'asignada', EN_EJECUCION: 'en ejecución', ESPERANDO_REPUESTO: 'esperando repuesto', CERRADA: 'cerrada', CANCELADA: 'cancelada',
};

export const numeroOT = (n: number) => `OT-${String(n).padStart(6, '0')}`;
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria de la planta. */
export function hoy(tz = process.env.APP_TZ ?? 'America/Bogota'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function sumarFrecuencia(fecha: string, valor: number, unidad: UnidadFrecuencia): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (unidad === UnidadFrecuencia.DIAS) d.setUTCDate(d.getUTCDate() + valor);
  else if (unidad === UnidadFrecuencia.SEMANAS) d.setUTCDate(d.getUTCDate() + valor * 7);
  else {
    // Si el día no existe en el mes destino (31 → febrero), se usa el último día del mes.
    const dia = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + valor);
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dia, ultimo));
  }
  return d.toISOString().slice(0, 10);
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

@Injectable()
export class MaintenanceService {
  private readonly dir: string;
  private readonly maxBytes: number;

  constructor(
    @InjectRepository(WorkOrder) private readonly orders: Repository<WorkOrder>,
    @InjectRepository(MaintenancePlan) private readonly plans: Repository<MaintenancePlan>,
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
    private readonly purchases: PurchasesService,
    private readonly notif: NotificationsService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get('UPLOADS_DIR', './uploads'), 'ordenes');
    this.maxBytes = Number(config.get('MAX_UPLOAD_MB', 20)) * 1024 * 1024;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  // ======================= Consultas =======================

  async list(q: ListOrdersQuery, actor: SessionUser) {
    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoin('o.activo', 'a')
      .addSelect(['a.id', 'a.codigo', 'a.nombre', 'a.area'])
      .leftJoin('o.asignadoA', 'u')
      .addSelect(['u.id', 'u.nombre'])
      .leftJoin('o.reportadoPor', 'r')
      .addSelect(['r.id', 'r.nombre'])
      .leftJoin('o.plan', 'p')
      .addSelect(['p.id', 'p.diasAviso'])
      .limit(300); // solo relaciones a uno: limit es seguro y permite ordenar por expresiones

    const vista = q.vista ?? 'abiertas';
    if (q.estado) qb.andWhere('o.estado IN (:...estados)', { estados: Array.isArray(q.estado) ? q.estado : [q.estado] });
    else if (vista === 'abiertas') qb.andWhere('o.estado IN (:...estados)', { estados: ABIERTAS });
    else if (vista === 'cerradas') qb.andWhere('o.estado IN (:...estados)', { estados: [EstadoOrden.CERRADA, EstadoOrden.CANCELADA] });
    if (q.tipo) qb.andWhere('o.tipo = :tipo', { tipo: q.tipo });
    if (q.activoId) qb.andWhere('o.activoId = :activoId', { activoId: q.activoId });

    // El operario solo ve lo que él reportó; "mías" para el técnico = asignadas a él o reportadas por él.
    if (actor.rol === Rol.OPERARIO) qb.andWhere('o.reportadoPorId = :me', { me: actor.id });
    else if (q.mias === 'true') qb.andWhere('(o.asignadoAId = :me OR o.reportadoPorId = :me)', { me: actor.id });

    if (vista === 'abiertas') {
      // Primero las máquinas paradas y la prioridad alta; luego por fecha.
      qb.orderBy('o.maquina_parada', 'DESC')
        .addOrderBy(`CASE o.prioridad WHEN 'ALTA' THEN 0 WHEN 'MEDIA' THEN 1 ELSE 2 END`)
        .addOrderBy('COALESCE(o.fecha_programada, o.creado_en::date)', 'ASC');
    } else {
      qb.orderBy('COALESCE(o.cerrada_en, o.actualizado_en)', 'DESC');
    }
    const items = await qb.getMany();
    return items.map((o) => this.conVencimiento(o));
  }

  async resumen() {
    const hoyStr = hoy();
    const rows: Array<Record<string, string>> = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE o.estado = ANY($1))                                    AS abiertas,
         COUNT(*) FILTER (WHERE o.estado = 'ABIERTA')                                  AS sin_asignar,
         COUNT(*) FILTER (WHERE o.estado = 'EN_EJECUCION')                             AS en_ejecucion,
         COUNT(*) FILTER (WHERE o.estado = 'ESPERANDO_REPUESTO')                       AS esperando_repuesto,
         COUNT(DISTINCT o.activo_id) FILTER (WHERE o.estado = ANY($1) AND o.maquina_parada) AS maquinas_paradas,
         COUNT(*) FILTER (WHERE o.estado = ANY($1) AND o.tipo = 'PREVENTIVO' AND o.fecha_programada < $2::date) AS preventivos_vencidos,
         COUNT(*) FILTER (WHERE o.estado = ANY($1) AND o.tipo = 'PREVENTIVO' AND o.fecha_programada >= $2::date
                          AND o.fecha_programada <= $2::date + COALESCE(p.dias_aviso, 7))                    AS preventivos_proximos
       FROM ordenes_trabajo o LEFT JOIN planes_mantenimiento p ON p.id = o.plan_id`,
      [ABIERTAS, hoyStr],
    );
    const r = rows[0];
    return {
      abiertas: Number(r.abiertas),
      sinAsignar: Number(r.sin_asignar),
      enEjecucion: Number(r.en_ejecucion),
      esperandoRepuesto: Number(r.esperando_repuesto),
      maquinasParadas: Number(r.maquinas_paradas),
      preventivosVencidos: Number(r.preventivos_vencidos),
      preventivosProximos: Number(r.preventivos_proximos),
    };
  }

  async get(id: string, actor: SessionUser) {
    const o = await this.orders
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.activo', 'a')
      .leftJoin('o.reportadoPor', 'r').addSelect(['r.id', 'r.nombre'])
      .leftJoin('o.asignadoA', 'u').addSelect(['u.id', 'u.nombre'])
      .leftJoin('o.cerradaPor', 'c').addSelect(['c.id', 'c.nombre'])
      .leftJoinAndSelect('o.plan', 'p')
      .leftJoinAndSelect('o.repuestos', 'rp')
      .leftJoin('rp.repuesto', 'rr').addSelect(['rr.id', 'rr.codigo', 'rr.descripcion', 'rr.unidad'])
      .leftJoinAndSelect('o.manoObra', 'mo')
      .leftJoin('mo.tecnico', 'mt').addSelect(['mt.id', 'mt.nombre'])
      .leftJoinAndSelect('o.eventos', 'e')
      .leftJoin('e.usuario', 'eu').addSelect(['eu.id', 'eu.nombre'])
      .leftJoinAndSelect('o.fotos', 'f')
      .leftJoin('f.subidoPor', 'fu').addSelect(['fu.id', 'fu.nombre'])
      .where('o.id = :id', { id })
      .orderBy('e.id', 'ASC')
      .addOrderBy('f.creadoEn', 'ASC')
      .getOne();
    if (!o) throw new NotFoundException('Orden de trabajo no encontrada');
    if (actor.rol === Rol.OPERARIO && o.reportadoPorId !== actor.id) throw new ForbiddenException('No tiene permiso para ver esta orden');

    // Disponibilidad de los repuestos planificados, para ver faltantes antes de ejecutar.
    const repuestos = await Promise.all(
      o.repuestos.map(async (rp) => {
        const stock = await this.inventory.stockDe(rp.repuestoId);
        return { ...rp, stock, faltante: o.estado === EstadoOrden.CERRADA ? 0 : Math.max(0, rp.cantidadPlanificada - Math.max(stock, 0)) };
      }),
    );
    return { ...this.conVencimiento(o), codigo: numeroOT(o.numero), repuestos, acciones: this.acciones(o, actor) };
  }

  /** Hoja de vida (ACT-03) y costo acumulado (ACT-04) de una máquina. */
  async historialActivo(activoId: string) {
    if (!(await this.assets.exists({ where: { id: activoId } }))) throw new NotFoundException('Máquina no encontrada');
    const ordenes = await this.orders
      .createQueryBuilder('o')
      .leftJoin('o.asignadoA', 'u').addSelect(['u.id', 'u.nombre'])
      .where('o.activoId = :activoId', { activoId })
      .orderBy('o.creadoEn', 'DESC')
      .take(200)
      .getMany();
    const [t] = await this.ds.query(
      `SELECT COALESCE(SUM(costo_repuestos),0) AS repuestos, COALESCE(SUM(costo_mano_obra),0) AS mano_obra,
              COALESCE(SUM(costo_servicios_externos),0) AS externos,
              COUNT(*) FILTER (WHERE tipo = 'CORRECTIVO') AS correctivos,
              COUNT(*) FILTER (WHERE tipo = 'PREVENTIVO') AS preventivos
       FROM ordenes_trabajo WHERE activo_id = $1 AND estado = 'CERRADA'`,
      [activoId],
    );
    const costos = { repuestos: Number(t.repuestos), manoObra: Number(t.mano_obra), externos: Number(t.externos) };
    return {
      costos: { ...costos, total: redondear(costos.repuestos + costos.manoObra + costos.externos) },
      cerradas: { correctivos: Number(t.correctivos), preventivos: Number(t.preventivos) },
      ordenes: ordenes.map((o) => ({ ...o, codigo: numeroOT(o.numero), costoTotal: redondear(o.costoRepuestos + o.costoManoObra + o.costoServiciosExternos) })),
    };
  }

  // ======================= Reporte de falla =======================

  /** MNT-01: cualquier usuario reporta una falla; se crea una OT correctiva abierta. */
  async reportarFalla(dto: ReportFaultDto, actor: SessionUser) {
    if (dto.clientId) {
      const previa = await this.orders.findOne({ where: { clientId: dto.clientId } });
      if (previa) return { ...previa, codigo: numeroOT(previa.numero), duplicado: true };
    }
    const activo = await this.assets.findOne({ where: { id: dto.activoId } });
    if (!activo) throw new NotFoundException('Máquina no encontrada');
    if (activo.estado === EstadoActivo.DADO_DE_BAJA) throw new BadRequestException('La máquina está dada de baja');

    const momento = dto.reportadoEn ? new Date(dto.reportadoEn) : new Date();
    if (momento.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('La hora del reporte no puede estar en el futuro');

    return this.ds.transaction(async (em) => {
      const o = await em.getRepository(WorkOrder).save(
        em.getRepository(WorkOrder).create({
          tipo: TipoOrden.CORRECTIVO,
          estado: EstadoOrden.ABIERTA,
          prioridad: dto.prioridad ?? (dto.maquinaParada ? Prioridad.ALTA : Prioridad.MEDIA),
          activoId: activo.id,
          descripcion: dto.descripcion.trim(),
          maquinaParada: dto.maquinaParada,
          inicioParada: dto.maquinaParada ? momento : null,
          reportadoPorId: actor.id,
          clientId: dto.clientId ?? null,
        }),
      );
      await this.evento(em, o.id, actor, null, EstadoOrden.ABIERTA, dto.maquinaParada ? 'Falla reportada con máquina parada' : 'Falla reportada');
      await this.recomputarEstadoActivo(em, activo.id, actor);
      // NOT-01 / MNT-01: la falla le llega a mantenimiento.
      await this.notif.notificar(em, { roles: [Rol.ADMIN, Rol.TECNICO], excluir: actor.id }, {
        tipo: 'FALLA_REPORTADA',
        titulo: `${dto.maquinaParada ? 'Máquina parada' : 'Falla reportada'}: ${activo.codigo} · ${activo.nombre}`,
        cuerpo: `${numeroOT(o.numero)} · ${o.descripcion} — ${actor.nombre}`,
        enlace: `/ordenes/${o.id}`,
      });
      return { ...o, codigo: numeroOT(o.numero), duplicado: false };
    });
  }

  // ======================= Transiciones =======================

  async asignar(id: string, dto: AssignDto, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const o = await this.bloquear(em, id);
      if (!ABIERTAS.includes(o.estado)) throw new BadRequestException(`No se puede asignar una orden ${ETIQUETA_ESTADO[o.estado]}`);
      if (actor.rol === Rol.TECNICO && (dto.tecnicoId !== actor.id || o.estado !== EstadoOrden.ABIERTA)) {
        throw new ForbiddenException('Un técnico solo puede tomar órdenes sin asignar, para sí mismo');
      }
      const tecnico = await em.getRepository(User).findOne({ where: { id: dto.tecnicoId } });
      if (!tecnico || !tecnico.activo || ![Rol.TECNICO, Rol.ADMIN].includes(tecnico.rol)) {
        throw new BadRequestException('Solo se puede asignar a un técnico o administrador activo');
      }
      const anterior = o.estado;
      const nuevoEstado = o.estado === EstadoOrden.ABIERTA ? EstadoOrden.ASIGNADA : o.estado;
      await em.getRepository(WorkOrder).update(o.id, { asignadoAId: tecnico.id, estado: nuevoEstado });
      await this.evento(em, o.id, actor, anterior, nuevoEstado, o.asignadoAId ? `Reasignada a ${tecnico.nombre}` : `Asignada a ${tecnico.nombre}`);
      // MNT-04: el técnico recibe aviso (si no se la tomó él mismo).
      const activo = await em.getRepository(Asset).findOneOrFail({ where: { id: o.activoId } });
      await this.notif.notificar(em, { usuarios: [tecnico.id], excluir: actor.id }, {
        tipo: 'OT_ASIGNADA',
        titulo: `Le asignaron ${numeroOT(o.numero)}: ${activo.codigo} · ${activo.nombre}`,
        cuerpo: `${o.tipo === TipoOrden.PREVENTIVO ? 'Preventivo' : 'Correctivo'}${o.maquinaParada ? ' · máquina parada' : ''} · ${o.descripcion}`,
        enlace: `/ordenes/${o.id}`,
      });
      return { ok: true };
    });
  }

  async iniciar(id: string, actor: SessionUser) {
    return this.transicion(id, actor, EstadoOrden.ASIGNADA, EstadoOrden.EN_EJECUCION, 'Trabajo iniciado', async (em, o) => {
      if (!o.iniciadaEn) await em.getRepository(WorkOrder).update(o.id, { iniciadaEn: new Date() });
      await this.purchases.verificarFaltantes(em, o.id, actor);
    });
  }

  async esperarRepuesto(id: string, nota: string | undefined, actor: SessionUser) {
    return this.transicion(id, actor, EstadoOrden.EN_EJECUCION, EstadoOrden.ESPERANDO_REPUESTO, nota?.trim() || 'En espera de repuesto');
  }

  async reanudar(id: string, actor: SessionUser) {
    return this.transicion(id, actor, EstadoOrden.ESPERANDO_REPUESTO, EstadoOrden.EN_EJECUCION, 'Trabajo reanudado');
  }

  /** Cierre de la OT (MNT-02, MNT-09, MNT-10): descuenta repuestos, registra mano de obra y congela costos. */
  async cerrar(id: string, dto: CloseOrderDto, actor: SessionUser) {
    const tarifa = await this.settings.getTarifaHora();
    return this.ds.transaction(async (em) => {
      const o = await this.bloquear(em, id);
      this.exigirEjecutor(o, actor);
      if (dto.clientId && o.cierreClientId === dto.clientId) {
        return { ok: true, duplicado: true, costoRepuestos: o.costoRepuestos, costoManoObra: o.costoManoObra, siguientePreventivo: null };
      }
      // D-01 (asumido): gana el primero en sincronizar. Si otra persona ya cerró o canceló la orden, este cierre se rechaza.
      this.exigirTransicion(o.estado, EstadoOrden.CERRADA);

      const sinConexion = !!dto.registradoSinConexion;
      let cerradaEn = new Date();
      if (dto.cerradaEn) {
        cerradaEn = new Date(dto.cerradaEn);
        if (cerradaEn.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('La hora de cierre no puede estar en el futuro');
        if (o.iniciadaEn && cerradaEn < o.iniciadaEn) cerradaEn = o.iniciadaEn;
      }

      let finParada: Date | null = null;
      if (o.maquinaParada) {
        finParada = dto.finParada ? new Date(dto.finParada) : null;
        if (!finParada) throw new BadRequestException('Indique la hora en que la máquina volvió a operar');
        if (o.inicioParada && finParada < o.inicioParada) {
          // El formulario maneja minutos: una diferencia menor a un minuto se ajusta al inicio de la parada.
          if (o.inicioParada.getTime() - finParada.getTime() < 60_000) finParada = o.inicioParada;
          else throw new BadRequestException('La puesta en marcha no puede ser anterior al inicio de la parada');
        }
        if (finParada.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('La puesta en marcha no puede estar en el futuro');
      }

      // Repuestos: se agrupan por repuesto y se descuentan del inventario (bloquea si no hay stock: D-02).
      const usados = new Map<string, number>();
      for (const p of dto.repuestosUsados) usados.set(p.repuestoId, (usados.get(p.repuestoId) ?? 0) + p.cantidad);
      const partsRepo = em.getRepository(WorkOrderPart);
      const planificados = await partsRepo.find({ where: { ordenId: o.id } });
      await this.validarRepuestos(em, dto.repuestosUsados.filter((p) => p.cantidad > 0));
      let costoRepuestos = 0;
      const codigo = numeroOT(o.numero);
      for (const [repuestoId, cantidad] of usados) {
        let fila = planificados.find((p) => p.repuestoId === repuestoId);
        let costoUnitario: number | null = null;
        if (cantidad > 0) {
          // D-02: un cierre hecho sin señal registra el consumo aunque el stock quede negativo (el repuesto ya se usó).
          const r = await this.inventory.registrarMovimiento(
            { repuestoId, tipo: TipoMovimiento.SALIDA_CONSUMO, cantidad, referencia: codigo },
            actor,
            { em, permitirNegativo: sinConexion },
          );
          costoUnitario = r.movimiento.costoUnitario;
          costoRepuestos += cantidad * costoUnitario;
        }
        if (!fila) fila = partsRepo.create({ ordenId: o.id, repuestoId, cantidadPlanificada: 0 });
        fila.cantidadUsada = cantidad;
        fila.costoUnitario = costoUnitario;
        await partsRepo.save(fila);
      }
      for (const p of planificados.filter((p) => !usados.has(p.repuestoId))) {
        await partsRepo.update(p.id, { cantidadUsada: 0 });
      }

      // Mano de obra con la tarifa vigente al cierre.
      const laborRepo = em.getRepository(WorkOrderLabor);
      let costoManoObra = 0;
      for (const l of dto.manoObra) {
        const tec = await em.getRepository(User).findOne({ where: { id: l.tecnicoId } });
        if (!tec) throw new BadRequestException('Técnico de mano de obra no encontrado');
        await laborRepo.save(laborRepo.create({ ordenId: o.id, tecnicoId: l.tecnicoId, horas: l.horas, tarifaHora: tarifa }));
        costoManoObra += l.horas * tarifa;
      }

      await em.getRepository(WorkOrder).update(o.id, {
        estado: EstadoOrden.CERRADA,
        trabajoRealizado: dto.trabajoRealizado.trim(),
        finParada,
        cerradaEn,
        cerradaPorId: actor.id,
        cierreClientId: dto.clientId ?? null,
        cerradaSinConexion: sinConexion,
        costoRepuestos: redondear(costoRepuestos),
        costoManoObra: redondear(costoManoObra),
        costoServiciosExternos: dto.costoServiciosExternos ?? 0,
      });
      await this.evento(em, o.id, actor, o.estado, EstadoOrden.CERRADA, sinConexion ? 'Orden cerrada (sin conexión, sincronizada después)' : 'Orden cerrada');
      await this.recomputarEstadoActivo(em, o.activoId, actor);
      // Quien reportó la falla se entera de que quedó atendida.
      if (o.tipo === TipoOrden.CORRECTIVO) {
        const activo = await em.getRepository(Asset).findOneOrFail({ where: { id: o.activoId } });
        await this.notif.notificar(em, { usuarios: [o.reportadoPorId], excluir: actor.id }, {
          tipo: 'FALLA_ATENDIDA', titulo: `Falla atendida: ${activo.codigo} · ${activo.nombre}`,
          cuerpo: `${numeroOT(o.numero)} · ${dto.trabajoRealizado.trim()}`, enlace: `/ordenes/${o.id}`,
        });
      }
      const siguiente = o.tipo === TipoOrden.PREVENTIVO ? await this.programarSiguiente(em, o, actor) : null;
      return { ok: true, costoRepuestos: redondear(costoRepuestos), costoManoObra: redondear(costoManoObra), siguientePreventivo: siguiente };
    });
  }

  async cancelar(id: string, motivo: string, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const o = await this.bloquear(em, id);
      this.exigirTransicion(o.estado, EstadoOrden.CANCELADA);
      await em.getRepository(WorkOrder).update(o.id, { estado: EstadoOrden.CANCELADA, motivoCancelacion: motivo.trim(), cerradaEn: new Date(), cerradaPorId: actor.id, finParada: o.maquinaParada ? new Date() : null });
      await this.evento(em, o.id, actor, o.estado, EstadoOrden.CANCELADA, `Cancelada: ${motivo.trim()}`);
      await this.audit.log({ usuarioId: actor.id, accion: 'OT_CANCELADA', entidad: 'orden', entidadId: o.id, detalle: { codigo: numeroOT(o.numero), motivo } }, em);
      await this.notif.notificar(em, { usuarios: [o.asignadoAId, o.tipo === TipoOrden.CORRECTIVO ? o.reportadoPorId : null], excluir: actor.id }, {
        tipo: 'OT_CANCELADA', titulo: `${numeroOT(o.numero)} cancelada`, cuerpo: motivo.trim(), enlace: `/ordenes/${o.id}`,
      });
      await this.recomputarEstadoActivo(em, o.activoId, actor);
      const siguiente = o.tipo === TipoOrden.PREVENTIVO ? await this.programarSiguiente(em, o, actor) : null;
      return { ok: true, siguientePreventivo: siguiente };
    });
  }

  /** Reemplaza los repuestos planificados de una OT que no se ha cerrado. */
  async setRepuestosPlanificados(id: string, repuestos: PartQtyDto[], actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const o = await this.bloquear(em, id);
      this.exigirEjecutor(o, actor);
      if (!ABIERTAS.includes(o.estado)) throw new BadRequestException('La orden ya no admite cambios');
      await this.validarRepuestos(em, repuestos);
      await em.getRepository(WorkOrderPart).delete({ ordenId: o.id });
      for (const p of this.agrupar(repuestos)) {
        await em.getRepository(WorkOrderPart).save({ ordenId: o.id, repuestoId: p.repuestoId, cantidadPlanificada: p.cantidad });
      }
      const solicitudes = await this.purchases.verificarFaltantes(em, o.id, actor);
      return { ok: true, solicitudesCreadas: solicitudes };
    });
  }

  // ======================= Fotos =======================

  async agregarFoto(id: string, momento: MomentoFoto, file: Express.Multer.File | undefined, actor: SessionUser, clientId?: string) {
    if (clientId) {
      const previa = await this.ds.getRepository(WorkOrderPhoto).findOne({ where: { clientId } });
      if (previa && previa.subidoPorId === actor.id) return { ...previa, duplicado: true };
      if (previa) throw new BadRequestException('Identificador de foto repetido');
    }
    const o = await this.orders.findOne({ where: { id } });
    if (!o) throw new NotFoundException('Orden de trabajo no encontrada');
    if (!Object.values(MomentoFoto).includes(momento)) throw new BadRequestException('Momento de foto inválido');
    const esReportante = o.reportadoPorId === actor.id;
    const esEjecutor = actor.rol === Rol.ADMIN || o.asignadoAId === actor.id;
    if (!(esEjecutor || (esReportante && momento === MomentoFoto.REPORTE))) throw new ForbiddenException('No puede adjuntar fotos a esta orden');
    if (!ABIERTAS.includes(o.estado)) throw new BadRequestException('La orden ya está cerrada');

    const tipo = validateUpload(file, this.maxBytes, ['image/jpeg', 'image/png']);
    const archivo = `${randomUUID()}${tipo.ext}`;
    await writeFile(join(this.dir, archivo), file!.buffer);
    const foto = await this.ds.getRepository(WorkOrderPhoto).save({
      ordenId: o.id, momento, archivo, mime: file!.mimetype, tamanoBytes: file!.size, subidoPorId: actor.id, clientId: clientId ?? null,
    });
    const { archivo: _omit, ...publico } = foto;
    return publico;
  }

  /**
   * Elimina una foto subida por error. Solo mientras la orden está abierta (cerrada, las fotos son evidencia
   * del trabajo) y solo quien la subió o un administrador. Queda en el historial de la OT y en la bitácora.
   */
  async eliminarFoto(fotoId: string, actor: SessionUser) {
    const f = await this.ds.getRepository(WorkOrderPhoto).createQueryBuilder('f').addSelect('f.archivo').where('f.id = :fotoId', { fotoId }).getOne();
    if (!f) throw new NotFoundException('Foto no encontrada');
    const o = await this.orders.findOne({ where: { id: f.ordenId } });
    if (!o) throw new NotFoundException('Orden de trabajo no encontrada');
    if (actor.rol !== Rol.ADMIN && f.subidoPorId !== actor.id) throw new ForbiddenException('Solo quien subió la foto o un administrador puede eliminarla');
    if (!ABIERTAS.includes(o.estado)) {
      throw new BadRequestException(`La orden está ${ETIQUETA_ESTADO[o.estado]}: sus fotos son evidencia del trabajo y ya no se pueden eliminar`);
    }
    const etiqueta = { [MomentoFoto.REPORTE]: 'del reporte', [MomentoFoto.ANTES]: '"Antes"', [MomentoFoto.DESPUES]: '"Después"' }[f.momento];
    await this.ds.transaction(async (em) => {
      await em.getRepository(WorkOrderPhoto).delete(f.id);
      await this.evento(em, o.id, actor, o.estado, o.estado, `Foto ${etiqueta} eliminada`);
      await this.audit.log({
        usuarioId: actor.id, accion: 'FOTO_ELIMINADA', entidad: 'orden', entidadId: o.id,
        detalle: { orden: numeroOT(o.numero), momento: f.momento, subidaPor: f.subidoPorId, subidaEn: f.creadoEn },
      }, em);
    });
    // El archivo se borra después de confirmar el cambio en la base.
    await unlink(join(this.dir, f.archivo)).catch(() => undefined);
    return { ok: true };
  }

  async abrirFoto(fotoId: string, actor: SessionUser) {
    const f = await this.ds.getRepository(WorkOrderPhoto).createQueryBuilder('f').addSelect('f.archivo').where('f.id = :fotoId', { fotoId }).getOne();
    if (!f) throw new NotFoundException('Foto no encontrada');
    if (actor.rol === Rol.OPERARIO) {
      const o = await this.orders.findOne({ where: { id: f.ordenId } });
      if (o?.reportadoPorId !== actor.id) throw new ForbiddenException('No tiene permiso para ver esta foto');
    }
    const ruta = join(this.dir, f.archivo);
    if (!existsSync(ruta)) throw new NotFoundException('El archivo no está disponible en el servidor');
    return { foto: f, stream: createReadStream(ruta) };
  }

  // ======================= Planes preventivos =======================

  listPlanes(activoId?: string) {
    const qb = this.plans
      .createQueryBuilder('p')
      .leftJoin('p.activo', 'a').addSelect(['a.id', 'a.codigo', 'a.nombre'])
      .leftJoin('p.tecnico', 't').addSelect(['t.id', 't.nombre'])
      .leftJoinAndSelect('p.repuestos', 'pr')
      .leftJoin('pr.repuesto', 'r').addSelect(['r.id', 'r.codigo', 'r.descripcion', 'r.unidad'])
      .orderBy('a.codigo').addOrderBy('p.nombre');
    if (activoId) qb.where('p.activoId = :activoId', { activoId });
    return qb.getMany();
  }

  async crearPlan(dto: CreatePlanDto, actor: SessionUser) {
    const activo = await this.assets.findOne({ where: { id: dto.activoId } });
    if (!activo) throw new NotFoundException('Máquina no encontrada');
    if (activo.estado === EstadoActivo.DADO_DE_BAJA) throw new BadRequestException('La máquina está dada de baja');
    if (dto.tecnicoId) await this.validarTecnico(dto.tecnicoId);

    return this.ds.transaction(async (em) => {
      await this.validarRepuestos(em, dto.repuestos);
      const plan = await em.getRepository(MaintenancePlan).save(
        em.getRepository(MaintenancePlan).create({
          activoId: dto.activoId,
          nombre: dto.nombre.trim(),
          tareas: dto.tareas?.trim() || null,
          frecuenciaValor: dto.frecuenciaValor,
          frecuenciaUnidad: dto.frecuenciaUnidad,
          diasAviso: dto.diasAviso ?? 7,
          tecnicoId: dto.tecnicoId ?? null,
          repuestos: this.agrupar(dto.repuestos).map((r) => em.getRepository(PlanPart).create({ repuestoId: r.repuestoId, cantidad: r.cantidad })),
        }),
      );
      const ot = await this.generarPreventivo(em, plan, dto.primeraFecha, actor);
      await this.audit.log({ usuarioId: actor.id, accion: 'PLAN_CREADO', entidad: 'plan', entidadId: plan.id, detalle: { nombre: plan.nombre, activo: activo.codigo, primeraOT: ot.codigo } }, em);
      return { plan, primeraOrden: ot };
    });
  }

  async actualizarPlan(id: string, dto: UpdatePlanDto, actor: SessionUser) {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    if (dto.tecnicoId) await this.validarTecnico(dto.tecnicoId);
    return this.ds.transaction(async (em) => {
      const cambios: Partial<MaintenancePlan> = {};
      if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
      if (dto.tareas !== undefined) cambios.tareas = dto.tareas?.trim() || null;
      if (dto.frecuenciaValor !== undefined) cambios.frecuenciaValor = dto.frecuenciaValor;
      if (dto.frecuenciaUnidad !== undefined) cambios.frecuenciaUnidad = dto.frecuenciaUnidad;
      if (dto.diasAviso !== undefined) cambios.diasAviso = dto.diasAviso;
      if (dto.tecnicoId !== undefined) cambios.tecnicoId = dto.tecnicoId;
      if (dto.vigente !== undefined) cambios.vigente = dto.vigente;
      if (Object.keys(cambios).length) await em.getRepository(MaintenancePlan).update(id, cambios);
      if (dto.repuestos) {
        await this.validarRepuestos(em, dto.repuestos);
        await em.getRepository(PlanPart).delete({ planId: id });
        for (const r of this.agrupar(dto.repuestos)) await em.getRepository(PlanPart).save({ planId: id, repuestoId: r.repuestoId, cantidad: r.cantidad });
      }
      await this.audit.log({ usuarioId: actor.id, accion: 'PLAN_ACTUALIZADO', entidad: 'plan', entidadId: id, detalle: { ...cambios, repuestos: dto.repuestos ? 'actualizados' : undefined } as Record<string, unknown> }, em);
      return em.getRepository(MaintenancePlan).findOneOrFail({ where: { id }, relations: { repuestos: true } });
    });
  }

  // ======================= Internos =======================

  private async transicion(
    id: string, actor: SessionUser, desde: EstadoOrden, hacia: EstadoOrden, nota: string,
    extra?: (em: EntityManager, o: WorkOrder) => Promise<void>,
  ) {
    return this.ds.transaction(async (em) => {
      const o = await this.bloquear(em, id);
      this.exigirEjecutor(o, actor);
      // Idempotente: si la acción ya se aplicó (p. ej. un reenvío al sincronizar), no es un error.
      if (o.estado === hacia) return { ok: true, sinCambios: true };
      if (o.estado !== desde) throw new BadRequestException(`La orden está ${ETIQUETA_ESTADO[o.estado]}; no se puede pasar a ${ETIQUETA_ESTADO[hacia]}`);
      this.exigirTransicion(o.estado, hacia);
      await em.getRepository(WorkOrder).update(o.id, { estado: hacia });
      if (extra) await extra(em, o);
      await this.evento(em, o.id, actor, o.estado, hacia, nota);
      await this.recomputarEstadoActivo(em, o.activoId, actor);
      return { ok: true };
    });
  }

  private async bloquear(em: EntityManager, id: string) {
    const o = await em.getRepository(WorkOrder).createQueryBuilder('o').setLock('pessimistic_write').where('o.id = :id', { id }).getOne();
    if (!o) throw new NotFoundException('Orden de trabajo no encontrada');
    return o;
  }

  private exigirEjecutor(o: WorkOrder, actor: SessionUser) {
    if (actor.rol !== Rol.ADMIN && o.asignadoAId !== actor.id) throw new ForbiddenException('Solo el técnico asignado o un administrador puede hacer esto');
  }

  private exigirTransicion(desde: EstadoOrden, hacia: EstadoOrden) {
    if (!TRANSICIONES[desde].includes(hacia)) throw new BadRequestException(`Una orden ${ETIQUETA_ESTADO[desde]} no puede pasar a ${ETIQUETA_ESTADO[hacia]}`);
  }

  private async evento(em: EntityManager, ordenId: string, actor: SessionUser | null, de: EstadoOrden | null, a: EstadoOrden, nota: string) {
    await em.getRepository(WorkOrderEvent).insert({ ordenId, usuarioId: actor?.id ?? null, estadoAnterior: de, estadoNuevo: a, nota });
  }

  /**
   * Estado de la máquina según sus OT abiertas (asumido):
   * máquina parada → Fuera de servicio; OT en ejecución o esperando repuesto → En mantenimiento; si no → Operativo.
   * Una máquina dada de baja no se toca.
   */
  private async recomputarEstadoActivo(em: EntityManager, activoId: string, actor: SessionUser) {
    const activo = await em.getRepository(Asset).findOne({ where: { id: activoId } });
    if (!activo || activo.estado === EstadoActivo.DADO_DE_BAJA) return;
    const abiertas = await em.getRepository(WorkOrder).find({ where: { activoId, estado: In(ABIERTAS) } });
    const nuevo = abiertas.some((o) => o.maquinaParada)
      ? EstadoActivo.FUERA_DE_SERVICIO
      : abiertas.some((o) => o.estado === EstadoOrden.EN_EJECUCION || o.estado === EstadoOrden.ESPERANDO_REPUESTO)
        ? EstadoActivo.EN_MANTENIMIENTO
        : EstadoActivo.OPERATIVO;
    if (nuevo !== activo.estado) {
      await em.getRepository(Asset).update(activoId, { estado: nuevo });
      await this.audit.log({ usuarioId: actor.id, accion: 'ACTIVO_ESTADO_AUTOMATICO', entidad: 'activo', entidadId: activoId, detalle: { estado: { antes: activo.estado, despues: nuevo } } }, em);
    }
  }

  private async generarPreventivo(em: EntityManager, plan: MaintenancePlan, fecha: string, actor: SessionUser) {
    const repuestos = plan.repuestos ?? (await em.getRepository(PlanPart).find({ where: { planId: plan.id } }));
    const estado = plan.tecnicoId ? EstadoOrden.ASIGNADA : EstadoOrden.ABIERTA;
    const o = await em.getRepository(WorkOrder).save(
      em.getRepository(WorkOrder).create({
        tipo: TipoOrden.PREVENTIVO,
        estado,
        prioridad: Prioridad.MEDIA,
        activoId: plan.activoId,
        planId: plan.id,
        descripcion: plan.tareas ? `${plan.nombre}\n${plan.tareas}` : plan.nombre,
        fechaProgramada: fecha,
        asignadoAId: plan.tecnicoId,
        reportadoPorId: actor.id,
        repuestos: repuestos.map((r) => em.getRepository(WorkOrderPart).create({ repuestoId: r.repuestoId, cantidadPlanificada: r.cantidad })),
      }),
    );
    await this.evento(em, o.id, actor, null, estado, `Preventivo programado para ${fecha}`);
    const solicitudesCreadas = await this.purchases.verificarFaltantes(em, o.id, actor);
    return { id: o.id, codigo: numeroOT(o.numero), fechaProgramada: fecha, solicitudesCreadas };
  }

  /**
   * Programa la siguiente OT del plan (MNT-05). Se mantiene la cadencia desde la fecha programada;
   * si esa fecha ya pasó, se cuenta desde hoy para no generar preventivos nacidos vencidos.
   */
  private async programarSiguiente(em: EntityManager, o: WorkOrder, actor: SessionUser) {
    if (!o.planId) return null;
    const plan = await em.getRepository(MaintenancePlan).findOne({ where: { id: o.planId }, relations: { repuestos: true } });
    if (!plan || !plan.vigente) return null;
    const otraAbierta = await em.getRepository(WorkOrder).exists({ where: { planId: plan.id, estado: In(ABIERTAS), id: Not(o.id) } });
    if (otraAbierta) return null;
    const hoyStr = hoy();
    let siguiente = sumarFrecuencia(o.fechaProgramada ?? hoyStr, plan.frecuenciaValor, plan.frecuenciaUnidad);
    if (siguiente <= hoyStr) siguiente = sumarFrecuencia(hoyStr, plan.frecuenciaValor, plan.frecuenciaUnidad);
    return this.generarPreventivo(em, plan, siguiente, actor);
  }

  private conVencimiento(o: WorkOrder) {
    let diasParaVencer: number | null = null;
    let vencida = false;
    let proxima = false;
    if (o.tipo === TipoOrden.PREVENTIVO && o.fechaProgramada && ABIERTAS.includes(o.estado)) {
      diasParaVencer = diasEntre(hoy(), o.fechaProgramada);
      vencida = diasParaVencer < 0;
      proxima = !vencida && diasParaVencer <= (o.plan?.diasAviso ?? 7);
    }
    return { ...o, codigo: numeroOT(o.numero), diasParaVencer, vencida, proxima };
  }

  /** Acciones que el usuario puede hacer sobre la OT; la interfaz solo muestra estas (la API igual las valida). */
  private acciones(o: WorkOrder, actor: SessionUser) {
    const admin = actor.rol === Rol.ADMIN;
    const ejecutor = admin || o.asignadoAId === actor.id;
    const abierta = ABIERTAS.includes(o.estado);
    return {
      asignar: abierta && admin,
      tomar: o.estado === EstadoOrden.ABIERTA && actor.rol === Rol.TECNICO,
      iniciar: ejecutor && o.estado === EstadoOrden.ASIGNADA,
      esperarRepuesto: ejecutor && o.estado === EstadoOrden.EN_EJECUCION,
      reanudar: ejecutor && o.estado === EstadoOrden.ESPERANDO_REPUESTO,
      cerrar: ejecutor && o.estado === EstadoOrden.EN_EJECUCION,
      cancelar: admin && abierta,
      editarRepuestos: ejecutor && abierta,
      subirFotos: abierta && (ejecutor || o.reportadoPorId === actor.id),
    };
  }

  private async validarRepuestos(em: EntityManager, items: Array<{ repuestoId: string }>) {
    const ids = [...new Set(items.map((i) => i.repuestoId))];
    if (!ids.length) return;
    const encontrados = await em.getRepository(SparePart).find({ where: { id: In(ids) } });
    if (encontrados.length !== ids.length) throw new BadRequestException('Uno de los repuestos no existe');
    const inactivo = encontrados.find((r) => !r.activo);
    if (inactivo) throw new BadRequestException(`El repuesto ${inactivo.codigo} está inactivo`);
  }

  private agrupar(items: PartQtyDto[]) {
    const m = new Map<string, number>();
    for (const i of items) if (i.cantidad > 0) m.set(i.repuestoId, (m.get(i.repuestoId) ?? 0) + i.cantidad);
    return [...m].map(([repuestoId, cantidad]) => ({ repuestoId, cantidad }));
  }

  private async validarTecnico(id: string) {
    const t = await this.ds.getRepository(User).findOne({ where: { id } });
    if (!t || !t.activo || ![Rol.TECNICO, Rol.ADMIN].includes(t.rol)) throw new BadRequestException('El responsable debe ser un técnico o administrador activo');
  }
}
