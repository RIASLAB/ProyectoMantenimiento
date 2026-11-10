import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Rol } from './enums';

export const IS_PUBLIC = 'isPublic';
/** Marca un endpoint como accesible sin iniciar sesión. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const SIN_CAMBIO = 'permitidoSinCambiarCredencial';
/** Endpoints que se pueden usar aunque el usuario aún deba cambiar la contraseña o el PIN que le pusieron. */
export const PermitidoSinCambio = () => SetMetadata(SIN_CAMBIO, true);

export const ROLES = 'roles';
/** Restringe un endpoint a los roles indicados (se valida en el servidor, no solo en la interfaz). */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

export interface SessionUser {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
  /** Debe cambiar la contraseña o el PIN que le asignó un administrador antes de usar el sistema. */
  debeCambiarCredencial?: boolean;
  /** Administrador principal (D-41). */
  principal?: boolean;
}

/** Usuario autenticado de la petición actual. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest().user,
);
