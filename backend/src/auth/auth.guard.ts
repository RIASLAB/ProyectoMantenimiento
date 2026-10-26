import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC, ROLES, SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { User } from '../users/user.entity';

/**
 * Guard global: exige token válido en todos los endpoints salvo los marcados @Public,
 * y verifica en cada petición que el usuario siga activo y con el rol vigente
 * (si un administrador desactiva o cambia de rol a alguien, aplica de inmediato).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Debe iniciar sesión');

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('La sesión expiró o no es válida');
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.activo) throw new UnauthorizedException('Usuario inactivo');

    const session: SessionUser = { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol };
    req.user = session;

    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.rol)) {
      throw new ForbiddenException('No tiene permiso para esta acción');
    }
    return true;
  }
}
