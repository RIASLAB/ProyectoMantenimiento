import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Modulos } from '../settings/setting.entity';
import { SettingsService } from '../settings/settings.service';

export const MODULO_KEY = 'modulo_requerido';
/** La ruta solo funciona con ese módulo encendido (D-40). */
export const RequiereModulo = (m: keyof Modulos) => SetMetadata(MODULO_KEY, m);

@Injectable()
export class ModuloGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly settings: SettingsService) {}

  async canActivate(ctx: ExecutionContext) {
    const m = this.reflector.getAllAndOverride<keyof Modulos | undefined>(MODULO_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (m) await this.settings.exigirModulo(m);
    return true;
  }
}
