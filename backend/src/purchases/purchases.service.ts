import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { EstadoCompra, EstadoOrden, OrigenCompra, Rol, TipoMovimiento } from '../common/enums';
import { InventoryService } from '../inventory/inventory.service';
import { SparePart } from '../inventory/spare-part.entity';
import { WorkOrder, WorkOrderEvent, WorkOrderPart } from '../maintenance/maintenance.entities';
import { Destino, NotificationsService } from '../notifications/notifications.service';
import { PARAM_AUTORIZADOR_COMPRAS, Setting } from '../settings/setting.entity';
import { BuyDto, CreatePurchaseDto, ListPurchasesQuery, ReceiveDto } from './purchases.dto';
import { PurchaseRequest } from './purchase-request.entity';

export const numeroSC = (n: number) => `SC-${String(n).padStart(6, '0')}`;
const numeroOT = (n: number) => `OT-${String(n).padStart(6, '0')}`;

/** Solicitudes que todavía cuentan como "en camino" para un faltante. */
const ABIERTAS = [EstadoCompra.PENDIENTE, EstadoCompra.APROBADA, EstadoCompra.COMPRADA];
const OT_ABIERTAS = [EstadoOrden.ABIERTA, EstadoOrden.ASIGNADA, EstadoOrden.EN_EJECUCION, EstadoOrden.ESPERANDO_REPUESTO];
const ETIQUETA: Record<EstadoCompra, string> = {
  PENDIENTE: 'pendiente', APROBADA: 'aprobada', RECHAZADA: 'rechazada', COMPRADA: 'comprada', RECIBIDA: 'recibida', CANCELADA: 'cancelada',
};

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseRequest) private readonly repo: Repository<PurchaseRequest>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly notif: NotificationsService,
  ) {}

  // ======================= Consultas =======================

  async list(q: ListPurchasesQuery, actor: SessionUser) {
    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoin('s.repuesto', 'r').addSelect(['r.id', 'r.codigo', 'r.descripcion', 'r.unidad'])
      .leftJoin('s.orden', 'o').addSelect(['o.id', 'o.numero', 'o.estado'])
      .leftJoin('o.activo', 'a').addSelect(['a.id', 'a.codigo', 'a.nombre'])
      .leftJoin('s.solicitadoPor', 'u').addSelect(['u.id', 'u.nombre'])
      .leftJoin('s.decididaPor', 'd').addSelect(['d.id', 'd.nombre'])
      .orderBy('s.creadoEn', 'DESC')
      .limit(300);
    const vista = q.vista ?? 'todas';
    if (q.estado) qb.andWhere('s.estado = :estado', { estado: q.estado });
    else if (vista === 'pendientes') qb.andWhere('s.estado = :p', { p: EstadoCompra.PENDIENTE });
    else if (vista === 'en_proceso') qb.andWhere('s.estado IN (:...e)', { e: [EstadoCompra.APROBADA, EstadoCompra.COMPRADA] });
    else if (vista === 'cerradas') qb.andWhere('s.estado IN (:...e)', { e: [EstadoCompra.RECIBIDA, EstadoCompra.RECHAZADA, EstadoCompra.CANCELADA] });
    if (q.ordenId) qb.andWhere('s.ordenId = :ordenId', { ordenId: q.ordenId });
    if (q.repuestoId) qb.andWhere('s.repuestoId = :repuestoId', { repuestoId: q.repuestoId });
    // El técnico ve las que pidió y las de las OT asignadas a él.
    if (actor.rol === Rol.TECNICO) qb.andWhere('(s.solicitadoPorId = :me OR o.asignadoAId = :me)', { me: actor.id });
    const items = await qb.getMany();
    return items.map((s) => this.publico(s));
  }

  async resumen() {
    const rows: Array<{ estado: EstadoCompra; n: string }> = await this.ds.query(
      `SELECT estado, COUNT(*) AS n FROM solicitudes_compra WHERE estado IN ('PENDIENTE','APROBADA','COMPRADA') GROUP BY estado`,
    );
    const n = (e: EstadoCompra) => Number(rows.find((r) => r.estado === e)?.n ?? 0);
    return { pendientes: n(EstadoCompra.PENDIENTE), aprobadas: n(EstadoCompra.APROBADA), compradas: n(EstadoCompra.COMPRADA) };
  }

  async get(id: string, actor: SessionUser) {
    const s = await this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.repuesto', 'r')
      .leftJoin('s.orden', 'o').addSelect(['o.id', 'o.numero', 'o.estado', 'o.asignadoAId'])
      .leftJoin('o.activo', 'a').addSelect(['a.id', 'a.codigo', 'a.nombre'])
      .leftJoin('s.solicitadoPor', 'u').addSelect(['u.id', 'u.nombre'])
      .leftJoin('s.decididaPor', 'd').addSelect(['d.id', 'd.nombre'])
      .leftJoin('s.recibidaPor', 'rp').addSelect(['rp.id', 'rp.nombre'])
      .where('s.id = :id', { id })
      .getOne();
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    if (actor.rol === Rol.TECNICO && s.solicitadoPorId !== actor.id && s.orden?.asignadoAId !== actor.id) {
      throw new ForbiddenException('No tiene permiso para ver esta solicitud');
    }
    const historial = await this.audit.list({ entidad: 'compra', entidadId: id, limite: 50 });
    const stock = await this.inventory.stockDe(s.repuestoId);
    const autorizadorId = await this.autorizadorVigente();
    return {
      ...this.publico(s),
      stock,
      historial: historial.items.reverse(),
      acciones: this.acciones(s, actor, autorizadorId),
    };
  }

  // ======================= Creación =======================

  /** Solicitud manual (COM-02). */
  async crear(dto: CreatePurchaseDto, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const rep = await em.getRepository(SparePart).findOne({ where: { id: dto.repuestoId } });
      if (!rep) throw new NotFoundException('Repuesto no encontrado');
      if (!rep.activo) throw new BadRequestException('El repuesto está inactivo');
      if (dto.ordenId) {
        const o = await em.getRepository(WorkOrder).findOne({ where: { id: dto.ordenId } });
        if (!o) throw new NotFoundException('Orden de trabajo no encontrada');
        if (!OT_ABIERTAS.includes(o.estado)) throw new BadRequestException('La orden de trabajo ya está cerrada');
      }
      const s = await em.getRepository(PurchaseRequest).save(
        em.getRepository(PurchaseRequest).create({
          origen: OrigenCompra.MANUAL, repuestoId: rep.id, cantidad: dto.cantidad, ordenId: dto.ordenId ?? null,
          justificacion: dto.justificacion.trim(), solicitadoPorId: actor.id,
        }),
      );
      await this.log(em, actor, s, 'COMPRA_SOLICITADA', { repuesto: rep.codigo, cantidad: dto.cantidad, origen: 'Manual' });
      if (s.ordenId) await this.eventoOT(em, s.ordenId, actor, `Solicitud de compra ${numeroSC(s.numero)}: ${rep.codigo} × ${dto.cantidad}`);
      await this.avisarAutorizador(em, s, rep, actor);
      return this.publico(s);
    });
  }

  /**
   * COM-01: revisa los repuestos planificados de una OT abierta y crea solicitudes automáticas por lo que falta.
   * Faltante = planificado − stock disponible − lo que ya está pedido para esa misma OT.
   * Si ya hay una solicitud pendiente para la misma OT y repuesto, se ajusta su cantidad en vez de duplicarla.
   */
  async verificarFaltantes(em: EntityManager, ordenId: string, actor: SessionUser) {
    const o = await em.getRepository(WorkOrder).findOne({ where: { id: ordenId } });
    if (!o || !OT_ABIERTAS.includes(o.estado)) return [];
    const planificados = await em.getRepository(WorkOrderPart).find({ where: { ordenId }, relations: { repuesto: true } });
    const creadas: string[] = [];
    for (const p of planificados) {
      if (p.cantidadPlanificada <= 0) continue;
      const stock = Math.max(await this.inventory.stockDe(p.repuestoId, em), 0);
      const abiertas = await em.getRepository(PurchaseRequest).find({ where: { ordenId, repuestoId: p.repuestoId, estado: In(ABIERTAS) } });
      const yaPedido = abiertas.filter((a) => a.estado !== EstadoCompra.PENDIENTE).reduce((t, a) => t + a.cantidad, 0);
      const faltante = Math.round((p.cantidadPlanificada - stock - yaPedido) * 1000) / 1000;
      const pendiente = abiertas.find((a) => a.estado === EstadoCompra.PENDIENTE);

      if (pendiente) {
        if (faltante > 0 && faltante !== pendiente.cantidad) {
          await em.getRepository(PurchaseRequest).update(pendiente.id, { cantidad: faltante });
          await this.log(em, actor, pendiente, 'COMPRA_AJUSTADA', { cantidad: { antes: pendiente.cantidad, despues: faltante } });
        }
        continue;
      }
      if (faltante <= 0) continue;
      const s = await em.getRepository(PurchaseRequest).save(
        em.getRepository(PurchaseRequest).create({
          origen: OrigenCompra.AUTOMATICA, repuestoId: p.repuestoId, cantidad: faltante, ordenId,
          justificacion: `Faltante para ${numeroOT(o.numero)}: se necesitan ${p.cantidadPlanificada} ${p.repuesto.unidad} y hay ${stock} en bodega`,
          solicitadoPorId: actor.id,
        }),
      );
      await this.log(em, actor, s, 'COMPRA_SOLICITADA', { repuesto: p.repuesto.codigo, cantidad: faltante, origen: 'Automática por faltante' });
      await this.eventoOT(em, ordenId, actor, `Solicitud de compra automática ${numeroSC(s.numero)}: ${p.repuesto.codigo} × ${faltante}`);
      await this.avisarAutorizador(em, s, p.repuesto, actor);
      creadas.push(numeroSC(s.numero));
    }
    return creadas;
  }

  // ======================= Decisiones =======================

  /** COM-03/05: solo el autorizador vigente, y nunca sobre una solicitud propia. */
  async aprobar(id: string, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const s = await this.bloquear(em, id);
      await this.exigirAutorizador(s, actor);
      this.exigirEstado(s, [EstadoCompra.PENDIENTE], 'aprobar');
      await em.getRepository(PurchaseRequest).update(s.id, { estado: EstadoCompra.APROBADA, decididaPorId: actor.id, decididaEn: new Date() });
      await this.log(em, actor, s, 'COMPRA_APROBADA', {});
      if (s.ordenId) await this.eventoOT(em, s.ordenId, actor, `Compra ${numeroSC(s.numero)} aprobada`);
      // Al solicitante, y a los administradores, que son quienes compran.
      await this.avisar(em, s, { usuarios: [s.solicitadoPorId], roles: [Rol.ADMIN], excluir: actor.id }, 'COMPRA_APROBADA', 'aprobada', `Aprobada por ${actor.nombre}. Falta comprarla.`);
      return { ok: true };
    });
  }

  /** COM-06 (D-09 asumido): el rechazo queda en la OT y la OT conserva su estado; mantenimiento decide cómo seguir. */
  async rechazar(id: string, motivo: string, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const s = await this.bloquear(em, id);
      await this.exigirAutorizador(s, actor);
      this.exigirEstado(s, [EstadoCompra.PENDIENTE], 'rechazar');
      await em.getRepository(PurchaseRequest).update(s.id, { estado: EstadoCompra.RECHAZADA, decididaPorId: actor.id, decididaEn: new Date(), motivoRechazo: motivo.trim() });
      await this.log(em, actor, s, 'COMPRA_RECHAZADA', { motivo: motivo.trim() });
      if (s.ordenId) await this.eventoOT(em, s.ordenId, actor, `Compra ${numeroSC(s.numero)} rechazada: ${motivo.trim()}`);
      // COM-06: el solicitante recibe el motivo.
      await this.avisar(em, s, { usuarios: [s.solicitadoPorId, await this.tecnicoOT(em, s)], excluir: actor.id }, 'COMPRA_RECHAZADA', 'rechazada', `Motivo: ${motivo.trim()}`);
      return { ok: true };
    });
  }

  async comprar(id: string, dto: BuyDto, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const s = await this.bloquear(em, id);
      this.exigirEstado(s, [EstadoCompra.APROBADA], 'registrar como comprada');
      await em.getRepository(PurchaseRequest).update(s.id, {
        estado: EstadoCompra.COMPRADA, proveedor: dto.proveedor.trim(), numeroOrdenCompra: dto.numeroOrdenCompra?.trim() || null,
        costoEstimado: dto.costoEstimado ?? null, compradaEn: new Date(),
      });
      await this.log(em, actor, s, 'COMPRA_REALIZADA', { proveedor: dto.proveedor, ordenCompra: dto.numeroOrdenCompra ?? null });
      return { ok: true };
    });
  }

  /** COM-08: la recepción entra al inventario (con costo real, que actualiza el promedio) y avisa en la OT. */
  async recibir(id: string, dto: ReceiveDto, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const s = await this.bloquear(em, id);
      // Se permite recibir una solicitud aprobada aunque no se haya registrado el paso "comprada" (compra de contado).
      this.exigirEstado(s, [EstadoCompra.APROBADA, EstadoCompra.COMPRADA], 'recibir');
      const codigo = numeroSC(s.numero);
      const mov = await this.inventory.registrarMovimiento(
        { repuestoId: s.repuestoId, tipo: TipoMovimiento.ENTRADA_COMPRA, cantidad: dto.cantidadRecibida, costoUnitario: dto.costoUnitario, referencia: codigo, motivo: dto.factura ? `Factura ${dto.factura}` : undefined },
        actor,
        { em },
      );
      await em.getRepository(PurchaseRequest).update(s.id, {
        estado: EstadoCompra.RECIBIDA, cantidadRecibida: dto.cantidadRecibida, costoUnitario: dto.costoUnitario,
        factura: dto.factura?.trim() || null, recibidaEn: new Date(), recibidaPorId: actor.id,
      });
      await this.log(em, actor, s, 'COMPRA_RECIBIDA', { cantidad: dto.cantidadRecibida, costoUnitario: dto.costoUnitario, factura: dto.factura ?? null, diferencia: dto.cantidadRecibida - s.cantidad || undefined });
      if (s.ordenId) {
        const o = await em.getRepository(WorkOrder).findOne({ where: { id: s.ordenId } });
        const listo = o?.estado === EstadoOrden.ESPERANDO_REPUESTO ? ' La orden ya puede reanudarse.' : '';
        await this.eventoOT(em, s.ordenId, actor, `Llegó el repuesto de ${codigo} (${dto.cantidadRecibida}).${listo}`);
      }
      // COM-08: se avisa a quien la pidió (y al técnico de la OT).
      const o = s.ordenId ? await em.getRepository(WorkOrder).findOne({ where: { id: s.ordenId } }) : null;
      await this.avisar(em, s, { usuarios: [s.solicitadoPorId, o?.asignadoAId], excluir: actor.id }, 'COMPRA_RECIBIDA', 'recibida en bodega',
        `Llegaron ${dto.cantidadRecibida}.${o ? ` ${numeroOT(o.numero)}${o.estado === EstadoOrden.ESPERANDO_REPUESTO ? ' ya puede reanudarse.' : ''}` : ''}`);
      return { ok: true, stockResultante: mov.stockResultante };
    });
  }

  /** El solicitante (mientras esté pendiente) o un administrador pueden cancelar. */
  async cancelar(id: string, motivo: string, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const s = await this.bloquear(em, id);
      const esAdmin = actor.rol === Rol.ADMIN;
      if (!esAdmin && !(s.solicitadoPorId === actor.id && s.estado === EstadoCompra.PENDIENTE)) {
        throw new ForbiddenException('Solo el solicitante (mientras esté pendiente) o un administrador puede cancelarla');
      }
      this.exigirEstado(s, ABIERTAS, 'cancelar');
      await em.getRepository(PurchaseRequest).update(s.id, { estado: EstadoCompra.CANCELADA, motivoRechazo: motivo.trim() });
      await this.log(em, actor, s, 'COMPRA_CANCELADA', { motivo: motivo.trim() });
      if (s.ordenId) await this.eventoOT(em, s.ordenId, actor, `Solicitud ${numeroSC(s.numero)} cancelada: ${motivo.trim()}`);
      return { ok: true };
    });
  }

  // ======================= Internos =======================

  private async autorizadorVigente(em?: EntityManager) {
    const p = await (em ?? this.ds.manager).getRepository(Setting).findOne({ where: { clave: PARAM_AUTORIZADOR_COMPRAS } });
    return p?.valor ?? null;
  }

  private async exigirAutorizador(s: PurchaseRequest, actor: SessionUser) {
    const vigente = await this.autorizadorVigente();
    if (!vigente) throw new BadRequestException('No hay autorizador de compras configurado');
    if (vigente !== actor.id) throw new ForbiddenException('Solo el autorizador de compras vigente puede decidir esta solicitud');
    if (s.solicitadoPorId === actor.id) throw new ForbiddenException('No puede aprobar ni rechazar una solicitud hecha por usted');
  }

  private exigirEstado(s: PurchaseRequest, permitidos: EstadoCompra[], accion: string) {
    if (!permitidos.includes(s.estado)) throw new BadRequestException(`No se puede ${accion} una solicitud ${ETIQUETA[s.estado]}`);
  }

  private async bloquear(em: EntityManager, id: string) {
    const s = await em.getRepository(PurchaseRequest).createQueryBuilder('s').setLock('pessimistic_write').where('s.id = :id', { id }).getOne();
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    return s;
  }

  private async log(em: EntityManager, actor: SessionUser, s: PurchaseRequest, accion: string, detalle: Record<string, unknown>) {
    await this.audit.log({ usuarioId: actor.id, accion, entidad: 'compra', entidadId: s.id, detalle: { codigo: numeroSC(s.numero), ...detalle } }, em);
  }

  /** NOT-01: una solicitud nueva le llega al autorizador vigente. */
  private async avisarAutorizador(em: EntityManager, s: PurchaseRequest, rep: SparePart, actor: SessionUser) {
    await this.notif.notificar(em, { usuarios: [await this.autorizadorVigente(em)], excluir: actor.id }, {
      tipo: 'COMPRA_SOLICITADA',
      titulo: `Solicitud de compra ${numeroSC(s.numero)}: ${rep.codigo} × ${s.cantidad}`,
      cuerpo: `${rep.descripcion} — ${s.justificacion}`,
      enlace: `/compras/${s.id}`,
    });
  }

  private async avisar(em: EntityManager, s: PurchaseRequest, destino: Destino, tipo: string, que: string, cuerpo: string) {
    const rep = await em.getRepository(SparePart).findOneOrFail({ where: { id: s.repuestoId } });
    await this.notif.notificar(em, destino, { tipo, titulo: `Compra ${numeroSC(s.numero)} ${que}: ${rep.codigo} · ${rep.descripcion}`, cuerpo, enlace: `/compras/${s.id}` });
  }

  private async tecnicoOT(em: EntityManager, s: PurchaseRequest) {
    if (!s.ordenId) return null;
    return (await em.getRepository(WorkOrder).findOne({ where: { id: s.ordenId } }))?.asignadoAId ?? null;
  }

  private async eventoOT(em: EntityManager, ordenId: string, actor: SessionUser, nota: string) {
    const o = await em.getRepository(WorkOrder).findOne({ where: { id: ordenId } });
    if (!o) return;
    // Evento informativo: el estado de la OT no cambia.
    await em.getRepository(WorkOrderEvent).insert({ ordenId, usuarioId: actor.id, estadoAnterior: o.estado, estadoNuevo: o.estado, nota: nota.slice(0, 500) });
  }

  private acciones(s: PurchaseRequest, actor: SessionUser, autorizadorId: string | null) {
    const decide = actor.id === autorizadorId && s.solicitadoPorId !== actor.id && s.estado === EstadoCompra.PENDIENTE;
    const admin = actor.rol === Rol.ADMIN;
    return {
      aprobar: decide,
      rechazar: decide,
      comprar: admin && s.estado === EstadoCompra.APROBADA,
      recibir: admin && (s.estado === EstadoCompra.APROBADA || s.estado === EstadoCompra.COMPRADA),
      cancelar: ABIERTAS.includes(s.estado) && (admin || (s.solicitadoPorId === actor.id && s.estado === EstadoCompra.PENDIENTE)),
      esPropia: s.solicitadoPorId === actor.id,
    };
  }

  private publico(s: PurchaseRequest) {
    const orden = s.orden ? { ...s.orden, codigo: numeroOT(s.orden.numero) } : null;
    return { ...s, codigo: numeroSC(s.numero), orden };
  }
}
