import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Rol } from '../common/enums';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { Setting, PARAM_AUTORIZADOR_COMPRAS } from '../settings/setting.entity';
import { hashCredencial, usaPin, validarCredencial } from './credentials';
import { User } from './user.entity';
import { CreateUserDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.repo.find({ order: { activo: 'DESC', nombre: 'ASC' } });
  }

  async tecnicos() {
    const us = await this.repo.find({ where: { activo: true, rol: In([Rol.TECNICO, Rol.ADMIN]) }, order: { rol: 'DESC', nombre: 'ASC' } });
    return us.map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol }));
  }

  async get(id: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  async create(dto: CreateUserDto, actor: SessionUser) {
    const usuario = dto.usuario.trim().toLowerCase();
    if (await this.repo.exists({ where: { usuario } })) throw new ConflictException('Ese nombre de usuario ya existe');
    validarCredencial(dto.rol, dto.credencial);

    return this.ds.transaction(async (em) => {
      const user = em.getRepository(User).create({
        nombre: dto.nombre.trim(),
        usuario,
        email: dto.email ?? null,
        rol: dto.rol,
        ...(await hashCredencial(dto.rol, dto.credencial)),
      });
      const saved = await em.getRepository(User).save(user);
      await this.audit.log(
        { usuarioId: actor.id, accion: 'USUARIO_CREADO', entidad: 'usuario', entidadId: saved.id, detalle: { usuario, rol: dto.rol } },
        em,
      );
      return this.strip(saved);
    });
  }

  async update(id: string, dto: UpdateUserDto, actor: SessionUser) {
    const user = await this.get(id);

    if (id === actor.id && (dto.activo === false || (dto.rol && dto.rol !== user.rol))) {
      throw new BadRequestException('No puede desactivarse ni cambiarse el rol a sí mismo');
    }

    const nuevoRol = dto.rol ?? user.rol;
    const cambiaTipoCredencial = dto.rol && usaPin(dto.rol) !== usaPin(user.rol);
    if (cambiaTipoCredencial && !dto.credencial) {
      throw new BadRequestException(usaPin(nuevoRol) ? 'Debe asignar un PIN para el nuevo rol' : 'Debe asignar una contraseña para el nuevo rol');
    }

    return this.ds.transaction(async (em) => {
      // Si deja de ser autorizador (rol o desactivación) y es el autorizador vigente, se impide para no dejar compras sin aprobador.
      if ((dto.rol && dto.rol !== user.rol) || dto.activo === false) {
        const vigente = await em.getRepository(Setting).findOne({ where: { clave: PARAM_AUTORIZADOR_COMPRAS } });
        if (vigente?.valor === id) {
          throw new BadRequestException('Este usuario es el autorizador de compras vigente. Asigne otro autorizador primero.');
        }
      }

      const cambios: Partial<User> = {};
      if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
      if (dto.email !== undefined) cambios.email = dto.email;
      if (dto.rol !== undefined) cambios.rol = dto.rol;
      if (dto.activo !== undefined) cambios.activo = dto.activo;
      if (dto.credencial) {
        validarCredencial(nuevoRol, dto.credencial);
        Object.assign(cambios, await hashCredencial(nuevoRol, dto.credencial), { intentosFallidos: 0, bloqueadoHasta: null });
      }
      await em.getRepository(User).update(id, cambios);

      const detalle: Record<string, unknown> = {};
      for (const k of ['nombre', 'email', 'rol', 'activo'] as const) {
        if (dto[k] !== undefined && dto[k] !== user[k]) detalle[k] = { antes: user[k], despues: dto[k] };
      }
      if (dto.credencial) detalle.credencial = 'restablecida';
      await this.audit.log({ usuarioId: actor.id, accion: 'USUARIO_ACTUALIZADO', entidad: 'usuario', entidadId: id, detalle }, em);

      return this.strip((await em.getRepository(User).findOne({ where: { id } }))!);
    });
  }

  private strip(u: User) {
    const { passwordHash, pinHash, ...rest } = u as User & Record<string, unknown>;
    return rest;
  }
}
