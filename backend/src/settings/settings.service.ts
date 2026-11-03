import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { User } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { FORMATOS_POR_DEFECTO, FormatoDocumental, PARAM_AUTORIZADOR_COMPRAS, PARAM_FORMATOS, PARAM_TARIFA_HORA, Setting } from './setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly notif: NotificationsService,
  ) {}

  /** Autorizador de compras vigente (COM-04). */
  async getAutorizador() {
    const s = await this.repo.findOne({ where: { clave: PARAM_AUTORIZADOR_COMPRAS } });
    if (!s?.valor) return { autorizador: null, actualizadoEn: null };
    const u = await this.users.findOne({ where: { id: s.valor } });
    return {
      autorizador: u ? { id: u.id, nombre: u.nombre, usuario: u.usuario } : null,
      actualizadoEn: s.actualizadoEn,
    };
  }

  /**
   * Cambia el autorizador sin tocar código. Debe ser un usuario activo con rol Autorizador,
   * y el cambio queda en bitácora (COM-05). La notificación a Dirección llega con el módulo de notificaciones.
   */
  async setAutorizador(usuarioId: string, actor: SessionUser) {
    const u = await this.users.findOne({ where: { id: usuarioId } });
    if (!u || !u.activo) throw new BadRequestException('El usuario no existe o está inactivo');
    // D-25: puede ser alguien de dirección (rol Autorizador) o el jefe de mantenimiento (Administrador).
    // Aunque haya varios administradores, solo el autorizador vigente decide las compras.
    if (u.rol !== Rol.AUTORIZADOR && u.rol !== Rol.ADMIN) throw new BadRequestException('El autorizador debe tener el rol Autorizador o Administrador');

    await this.ds.transaction(async (em) => {
      const r = em.getRepository(Setting);
      const anterior = await r.findOne({ where: { clave: PARAM_AUTORIZADOR_COMPRAS } });
      await r.save({ clave: PARAM_AUTORIZADOR_COMPRAS, valor: usuarioId });
      await this.audit.log(
        {
          usuarioId: actor.id,
          accion: 'AUTORIZADOR_CAMBIADO',
          entidad: 'parametro',
          entidadId: PARAM_AUTORIZADOR_COMPRAS,
          detalle: { anterior: anterior?.valor ?? null, nuevo: usuarioId },
        },
        em,
      );
      // COM-05: el cambio se notifica a Dirección (administradores) y a los dos autorizadores.
      const previo = anterior?.valor ? await em.getRepository(User).findOne({ where: { id: anterior.valor } }) : null;
      await this.notif.notificar(em, { roles: [Rol.ADMIN], usuarios: [usuarioId, previo?.id], excluir: actor.id }, {
        tipo: 'AUTORIZADOR_CAMBIADO',
        titulo: `Nuevo autorizador de compras: ${u.nombre}`,
        cuerpo: `${previo ? `Reemplaza a ${previo.nombre}. ` : ''}Cambio hecho por ${actor.nombre}. Las solicitudes pendientes pasan a ${u.nombre}.`,
        enlace: '/compras',
      });
    });
    return this.getAutorizador();
  }

  /** Tarifa por hora de mano de obra de los técnicos, para el costo de las OT (D-03 asumido). */
  async getTarifaHora(): Promise<number> {
    const s = await this.repo.findOne({ where: { clave: PARAM_TARIFA_HORA } });
    return s?.valor ? Number(s.valor) : 0;
  }

  async setTarifaHora(valor: number, actor: SessionUser) {
    await this.ds.transaction(async (em) => {
      const r = em.getRepository(Setting);
      const anterior = await r.findOne({ where: { clave: PARAM_TARIFA_HORA } });
      await r.save({ clave: PARAM_TARIFA_HORA, valor: String(valor) });
      await this.audit.log(
        { usuarioId: actor.id, accion: 'TARIFA_HORA_CAMBIADA', entidad: 'parametro', entidadId: PARAM_TARIFA_HORA, detalle: { anterior: anterior?.valor ?? null, nuevo: valor } },
        em,
      );
    });
    return { tarifaHora: valor };
  }

  /** Formatos documentales: los por defecto más los configurados (las planillas de temperatura pueden ser por planta: "TEMPERATURA:Planta Pollo"). */
  async getFormatos(): Promise<Record<string, FormatoDocumental>> {
    const s = await this.repo.findOne({ where: { clave: PARAM_FORMATOS } });
    let guardados: Record<string, FormatoDocumental> = {};
    try {
      guardados = s?.valor ? JSON.parse(s.valor) : {};
    } catch {
      guardados = {};
    }
    return { ...FORMATOS_POR_DEFECTO, ...guardados };
  }

  /** El formato de una clave, o el general de su tipo ("TEMPERATURA:Planta X" → "TEMPERATURA"). */
  async getFormato(clave: string): Promise<FormatoDocumental | null> {
    const todos = await this.getFormatos();
    return todos[clave] ?? todos[clave.split(':')[0]] ?? null;
  }

  async setFormato(clave: string, f: FormatoDocumental, actor: SessionUser, em?: EntityManager) {
    const run = async (m: EntityManager) => {
      const r = m.getRepository(Setting);
      const s = await r.findOne({ where: { clave: PARAM_FORMATOS }, lock: { mode: 'pessimistic_write' } });
      let guardados: Record<string, FormatoDocumental> = {};
      try {
        guardados = s?.valor ? JSON.parse(s.valor) : {};
      } catch {
        guardados = {};
      }
      const anterior = guardados[clave] ?? FORMATOS_POR_DEFECTO[clave] ?? null;
      guardados[clave] = f;
      await r.save({ clave: PARAM_FORMATOS, valor: JSON.stringify(guardados) });
      await this.audit.log({ usuarioId: actor.id, accion: 'FORMATO_ACTUALIZADO', entidad: 'parametro', entidadId: clave, detalle: { anterior, nuevo: f } }, m);
    };
    if (em) await run(em);
    else await this.ds.transaction(run);
    return this.getFormatos();
  }
}
