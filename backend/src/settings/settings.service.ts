import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { User } from '../users/user.entity';
import { PARAM_AUTORIZADOR_COMPRAS, Setting } from './setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
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
    if (u.rol !== Rol.AUTORIZADOR) throw new BadRequestException('El autorizador debe tener el rol Autorizador');

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
    });
    return this.getAutorizador();
  }
}
