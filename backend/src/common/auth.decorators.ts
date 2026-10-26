import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Rol } from './enums';

export const IS_PUBLIC = 'isPublic';
/** Marca un endpoint como accesible sin iniciar sesión. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Restringe un endpoint a los roles indicados (se valida en el servidor, no solo en la interfaz). */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

export interface SessionUser {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
}

/** Usuario autenticado de la petición actual. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest().user,
);
