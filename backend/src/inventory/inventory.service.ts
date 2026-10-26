import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { TIPOS_ENTRADA, TipoMovimiento } from '../common/enums';
import { InventoryMovement } from './inventory-movement.entity';
import { CreateMovementDto, CreateSparePartDto, PhysicalCountDto, UpdateSparePartDto } from './inventory.dto';
import { SparePart } from './spare-part.entity';

export interface SparePartWithStock extends SparePart {
  stock: number;
  valorInventario: number;
  bajoMinimo: boolean;
}

export interface MovementOptions {
  /**
   * D-02 (asumido): una salida desde la app en línea se bloquea si no hay stock suficiente.
   * Los consumos que llegan de una sincronización offline se registran igual (permitirNegativo)
   * y generan alerta, porque el repuesto ya se usó físicamente.
   */
  permitirNegativo?: boolean;
  em?: EntityManager;
}

const redondear = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(SparePart) private readonly parts: Repository<SparePart>,
    @InjectRepository(InventoryMovement) private readonly movs: Repository<InventoryMovement>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  // ---------- Catálogo ----------

  async list(f: { q?: string; bajoMinimo?: boolean; incluirInactivos?: boolean }): Promise<SparePartWithStock[]> {
    const qb = this.parts
      .createQueryBuilder('r')
      .addSelect((sq) => sq.select('COALESCE(SUM(m.cantidad), 0)').from(InventoryMovement, 'm').where('m.repuesto_id = r.id'), 'stock')
      .orderBy('r.codigo');
    if (!f.incluirInactivos) qb.andWhere('r.activo = true');
    if (f.q) qb.andWhere('(r.codigo ILIKE :q OR r.descripcion ILIKE :q OR r.codigoSap ILIKE :q)', { q: `%${f.q.trim()}%` });

    const { entities, raw } = await qb.getRawAndEntities();
    const items = entities.map((e, i) => this.conStock(e, Number(raw[i].stock)));
    return f.bajoMinimo ? items.filter((i) => i.bajoMinimo) : items;
  }

  async get(id: string): Promise<SparePartWithStock> {
    const p = await this.parts.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Repuesto no encontrado');
    return this.conStock(p, await this.stockDe(id));
  }

  async create(dto: CreateSparePartDto, actor: SessionUser) {
    const codigo = dto.codigo.trim().toUpperCase();
    if (await this.parts.exists({ where: { codigo } })) throw new ConflictException(`Ya existe un repuesto con el código ${codigo}`);
    return this.ds.transaction(async (em) => {
      const saved = await em.getRepository(SparePart).save(
        em.getRepository(SparePart).create({
          codigo,
          codigoSap: dto.codigoSap?.trim() || null,
          descripcion: dto.descripcion.trim(),
          unidad: dto.unidad.trim().toUpperCase(),
          ubicacion: dto.ubicacion?.trim() || null,
          stockMinimo: dto.stockMinimo ?? 0,
        }),
      );
      await this.audit.log({ usuarioId: actor.id, accion: 'REPUESTO_CREADO', entidad: 'repuesto', entidadId: saved.id, detalle: { codigo } }, em);
      return this.conStock(saved, 0);
    });
  }

  async update(id: string, dto: UpdateSparePartDto, actor: SessionUser) {
    const actual = await this.parts.findOne({ where: { id } });
    if (!actual) throw new NotFoundException('Repuesto no encontrado');
    const cambios: Partial<SparePart> = {};
    if (dto.codigo !== undefined) {
      cambios.codigo = dto.codigo.trim().toUpperCase();
      if (cambios.codigo !== actual.codigo && (await this.parts.exists({ where: { codigo: cambios.codigo } }))) {
        throw new ConflictException(`Ya existe un repuesto con el código ${cambios.codigo}`);
      }
    }
    if (dto.codigoSap !== undefined) cambios.codigoSap = dto.codigoSap?.trim() || null;
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion.trim();
    if (dto.unidad !== undefined) cambios.unidad = dto.unidad.trim().toUpperCase();
    if (dto.ubicacion !== undefined) cambios.ubicacion = dto.ubicacion?.trim() || null;
    if (dto.stockMinimo !== undefined) cambios.stockMinimo = dto.stockMinimo;
    if (dto.activo !== undefined) cambios.activo = dto.activo;

    const detalle: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cambios)) {
      const antes = (actual as unknown as Record<string, unknown>)[k];
      if (v !== antes) detalle[k] = { antes, despues: v };
    }
    if (Object.keys(detalle).length) {
      await this.ds.transaction(async (em) => {
        await em.getRepository(SparePart).update(id, cambios);
        await this.audit.log({ usuarioId: actor.id, accion: 'REPUESTO_ACTUALIZADO', entidad: 'repuesto', entidadId: id, detalle }, em);
      });
    }
    return this.get(id);
  }

  // ---------- Movimientos ----------

  /**
   * Registra un movimiento con bloqueo de fila del repuesto, de modo que dos movimientos
   * simultáneos no calculen el stock ni el costo promedio sobre el mismo saldo.
   */
  async registrarMovimiento(dto: CreateMovementDto, actor: SessionUser, opts: MovementOptions = {}) {
    if (dto.clientId) {
      const previo = await (opts.em ?? this.ds.manager).getRepository(InventoryMovement).findOne({ where: { clientId: dto.clientId } });
      if (previo) return { movimiento: previo, duplicado: true, stockResultante: await this.stockDe(previo.repuestoId, opts.em) };
    }

    const esEntrada = TIPOS_ENTRADA.includes(dto.tipo);
    if (dto.tipo === TipoMovimiento.ENTRADA_COMPRA && dto.costoUnitario === undefined) {
      throw new BadRequestException('La entrada por compra requiere el costo unitario');
    }
    if ((dto.tipo === TipoMovimiento.ENTRADA_AJUSTE || dto.tipo === TipoMovimiento.SALIDA_AJUSTE) && !dto.motivo?.trim()) {
      throw new BadRequestException('Los ajustes de inventario requieren un motivo');
    }
    if (dto.tipo === TipoMovimiento.SALIDA_CONSUMO && !dto.referencia?.trim()) {
      throw new BadRequestException('El consumo requiere la referencia de la orden de trabajo');
    }

    const run = async (em: EntityManager) => {
      const repuesto = await em
        .getRepository(SparePart)
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id: dto.repuestoId })
        .getOne();
      if (!repuesto) throw new NotFoundException('Repuesto no encontrado');
      if (!repuesto.activo) throw new BadRequestException('El repuesto está inactivo');

      const stockAntes = await this.stockDe(repuesto.id, em);
      const cantidadConSigno = esEntrada ? dto.cantidad : -dto.cantidad;
      const stockDespues = redondear(stockAntes + cantidadConSigno, 3);

      if (!esEntrada && stockDespues < 0 && !opts.permitirNegativo) {
        throw new BadRequestException(
          `Stock insuficiente de ${repuesto.codigo}: hay ${stockAntes} ${repuesto.unidad} y se intenta sacar ${dto.cantidad}`,
        );
      }

      // D-04 (asumido): costo promedio ponderado; solo las compras cambian el promedio.
      let costoUnitario = repuesto.costoPromedio;
      if (dto.tipo === TipoMovimiento.ENTRADA_COMPRA) {
        costoUnitario = dto.costoUnitario!;
        const base = Math.max(stockAntes, 0);
        const nuevoPromedio = base + dto.cantidad > 0 ? (base * repuesto.costoPromedio + dto.cantidad * costoUnitario) / (base + dto.cantidad) : costoUnitario;
        await em.getRepository(SparePart).update(repuesto.id, { costoPromedio: redondear(nuevoPromedio, 2) });
      }

      const mov = await em.getRepository(InventoryMovement).save(
        em.getRepository(InventoryMovement).create({
          repuestoId: repuesto.id,
          tipo: dto.tipo,
          cantidad: cantidadConSigno,
          costoUnitario: redondear(costoUnitario, 2),
          motivo: dto.motivo?.trim() || null,
          referencia: dto.referencia?.trim() || null,
          clientId: dto.clientId ?? null,
          usuarioId: actor.id,
        }),
      );

      if (dto.tipo === TipoMovimiento.ENTRADA_AJUSTE || dto.tipo === TipoMovimiento.SALIDA_AJUSTE || stockDespues < 0) {
        await this.audit.log(
          {
            usuarioId: actor.id,
            accion: stockDespues < 0 ? 'STOCK_NEGATIVO' : 'AJUSTE_INVENTARIO',
            entidad: 'repuesto',
            entidadId: repuesto.id,
            detalle: { movimientoId: mov.id, tipo: dto.tipo, cantidad: cantidadConSigno, stockAntes, stockDespues, motivo: dto.motivo ?? null },
          },
          em,
        );
      }

      return {
        movimiento: mov,
        duplicado: false,
        stockResultante: stockDespues,
        alertaStockNegativo: stockDespues < 0,
        alertaBajoMinimo: stockDespues < repuesto.stockMinimo,
      };
    };

    return opts.em ? run(opts.em) : this.ds.transaction(run);
  }

  /** Conteo físico (INV-07): compara con el stock del sistema y genera el ajuste por la diferencia. */
  async conteoFisico(dto: PhysicalCountDto, actor: SessionUser) {
    return this.ds.transaction(async (em) => {
      const repuesto = await em
        .getRepository(SparePart)
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id: dto.repuestoId })
        .getOne();
      if (!repuesto) throw new NotFoundException('Repuesto no encontrado');

      const stockSistema = await this.stockDe(repuesto.id, em);
      const diferencia = redondear(dto.cantidadContada - stockSistema, 3);

      let movimiento: InventoryMovement | null = null;
      if (diferencia !== 0) {
        const r = await this.registrarMovimiento(
          {
            repuestoId: repuesto.id,
            tipo: diferencia > 0 ? TipoMovimiento.ENTRADA_AJUSTE : TipoMovimiento.SALIDA_AJUSTE,
            cantidad: Math.abs(diferencia),
            motivo: `Conteo físico: ${dto.motivo.trim()}`,
          },
          actor,
          { em, permitirNegativo: false },
        );
        movimiento = r.movimiento;
      }
      await this.audit.log(
        {
          usuarioId: actor.id,
          accion: 'CONTEO_FISICO',
          entidad: 'repuesto',
          entidadId: repuesto.id,
          detalle: { stockSistema, cantidadContada: dto.cantidadContada, diferencia, motivo: dto.motivo, movimientoId: movimiento?.id ?? null },
        },
        em,
      );
      return { stockSistema, cantidadContada: dto.cantidadContada, diferencia, movimiento };
    });
  }

  /** Kardex (INV-04): movimientos en orden cronológico con saldo acumulado calculado en la base de datos. */
  async kardex(repuestoId: string, f: { desde?: string; hasta?: string }) {
    const repuesto = await this.get(repuestoId);
    const params: unknown[] = [repuestoId];
    let filtro = '';
    if (f.desde) { params.push(f.desde); filtro += ` AND k.creado_en >= $${params.length}::date`; }
    if (f.hasta) { params.push(f.hasta); filtro += ` AND k.creado_en < ($${params.length}::date + 1)`; }

    const rows: Array<Record<string, unknown>> = await this.ds.query(
      `SELECT * FROM (
         SELECT m.id, m.tipo, m.cantidad, m.costo_unitario, m.motivo, m.referencia, m.creado_en,
                u.nombre AS usuario,
                SUM(m.cantidad) OVER (ORDER BY m.creado_en, m.id) AS saldo
         FROM movimientos_inventario m
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.repuesto_id = $1
       ) k WHERE true ${filtro}
       ORDER BY k.creado_en, k.id`,
      params,
    );
    return {
      repuesto,
      movimientos: rows.map((r) => ({
        id: String(r.id),
        tipo: r.tipo,
        cantidad: Number(r.cantidad),
        costoUnitario: Number(r.costo_unitario),
        valor: redondear(Number(r.cantidad) * Number(r.costo_unitario), 2),
        motivo: r.motivo,
        referencia: r.referencia,
        usuario: r.usuario,
        fecha: r.creado_en,
        saldo: Number(r.saldo),
      })),
    };
  }

  /** Exportación del inventario (INV-09) en CSV separado por punto y coma, que Excel en español abre directamente. */
  async exportCsv(): Promise<string> {
    const items = await this.list({ incluirInactivos: true });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (n: number) => String(n).replace('.', ',');
    const header = ['Código', 'Código SAP', 'Descripción', 'Unidad', 'Ubicación', 'Stock', 'Stock mínimo', 'Bajo mínimo', 'Costo promedio', 'Valor inventario', 'Activo'];
    const lines = items.map((i) =>
      [
        i.codigo, i.codigoSap, i.descripcion, i.unidad, i.ubicacion, num(i.stock), num(i.stockMinimo),
        i.bajoMinimo ? 'Sí' : 'No', num(i.costoPromedio), num(i.valorInventario), i.activo ? 'Sí' : 'No',
      ].map(esc).join(';'),
    );
    return '﻿' + [header.join(';'), ...lines].join('\r\n');
  }

  // ---------- Utilidades ----------

  async stockDe(repuestoId: string, em?: EntityManager): Promise<number> {
    const r = await (em ?? this.ds.manager)
      .getRepository(InventoryMovement)
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.cantidad), 0)', 's')
      .where('m.repuestoId = :repuestoId', { repuestoId })
      .getRawOne<{ s: string }>();
    return Number(r?.s ?? 0);
  }

  private conStock(p: SparePart, stock: number): SparePartWithStock {
    return Object.assign(p, {
      stock,
      valorInventario: redondear(Math.max(stock, 0) * p.costoPromedio, 2),
      bajoMinimo: stock < p.stockMinimo,
    });
  }
}
