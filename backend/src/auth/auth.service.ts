import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { hashCredencial, usaPin, validarCredencial } from '../users/credentials';
import { User } from '../users/user.entity';

export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
const MENSAJE_GENERICO = 'Usuario o credencial incorrectos';
const HASH_FICTICIO = bcrypt.hashSync('credencial-ficticia', 12);
/**
 * Además del bloqueo por usuario: tope de intentos fallidos por dirección IP en 15 minutos,
 * para que nadie pruebe PIN contra muchos usuarios desde el mismo equipo.
 */
const MAX_FALLOS_IP = Number(process.env.LOGIN_MAX_FALLOS_IP ?? 30);
const VENTANA_IP_MS = 15 * 60_000;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  private readonly fallosIp = new Map<string, { n: number; hasta: number }>();

  private revisarIp(ip?: string) {
    if (!ip) return;
    const f = this.fallosIp.get(ip);
    if (f && f.hasta > Date.now() && f.n >= MAX_FALLOS_IP) {
      throw new HttpException('Demasiados intentos fallidos desde este equipo. Espere 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private fallo(ip?: string) {
    if (!ip) return;
    const ahora = Date.now();
    const f = this.fallosIp.get(ip);
    this.fallosIp.set(ip, f && f.hasta > ahora ? { n: f.n + 1, hasta: f.hasta } : { n: 1, hasta: ahora + VENTANA_IP_MS });
    if (this.fallosIp.size > 10_000) for (const [k, v] of this.fallosIp) if (v.hasta <= ahora) this.fallosIp.delete(k);
  }

  async login(usuario: string, credencial: string, ip?: string) {
    this.revisarIp(ip);
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.pinHash'])
      .where('u.usuario = :usuario', { usuario: usuario.trim().toLowerCase() })
      .getOne();

    // Mismo mensaje para usuario inexistente o credencial errada: no revela qué usuarios existen.
    if (!user || !user.activo) {
      await bcrypt.compare(credencial, HASH_FICTICIO); // mantiene el tiempo de respuesta similar
      this.fallo(ip);
      throw new UnauthorizedException(MENSAJE_GENERICO);
    }

    if (user.bloqueadoHasta && user.bloqueadoHasta > new Date()) {
      throw new UnauthorizedException(
        `Usuario bloqueado temporalmente por intentos fallidos. Intente de nuevo después de las ${user.bloqueadoHasta.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' })}`,
      );
    }

    const hash = usaPin(user.rol) ? user.pinHash : user.passwordHash;
    const ok = !!hash && (await bcrypt.compare(credencial, hash));

    if (!ok) {
      const intentos = user.intentosFallidos + 1;
      const bloquear = intentos >= MAX_INTENTOS;
      await this.users.update(user.id, {
        intentosFallidos: bloquear ? 0 : intentos,
        bloqueadoHasta: bloquear ? new Date(Date.now() + MINUTOS_BLOQUEO * 60_000) : null,
      });
      if (bloquear) {
        await this.audit.log({ usuarioId: user.id, accion: 'USUARIO_BLOQUEADO', entidad: 'usuario', entidadId: user.id });
      }
      this.fallo(ip);
      throw new UnauthorizedException(MENSAJE_GENERICO);
    }

    if (user.intentosFallidos > 0 || user.bloqueadoHasta) {
      await this.users.update(user.id, { intentosFallidos: 0, bloqueadoHasta: null });
    }

    const token = await this.jwt.signAsync({ sub: user.id, rol: user.rol });
    return {
      token,
      usuario: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol, debeCambiarCredencial: user.debeCambiarCredencial, principal: user.principal },
    };
  }

  /** Cambio de la propia credencial: exige la actual, valida la nueva y la marca como elegida por el usuario. */
  async cambiarCredencial(actor: SessionUser, actual: string, nueva: string) {
    const user = await this.users.createQueryBuilder('u').addSelect(['u.passwordHash', 'u.pinHash']).where('u.id = :id', { id: actor.id }).getOneOrFail();
    const hash = usaPin(user.rol) ? user.pinHash : user.passwordHash;
    const pin = usaPin(user.rol);
    const tipo = pin ? 'PIN' : 'contraseña';
    if (!hash || !(await bcrypt.compare(actual, hash))) throw new BadRequestException(pin ? 'El PIN actual no es correcto' : 'La contraseña actual no es correcta');
    if (actual === nueva) throw new BadRequestException(pin ? 'El nuevo PIN debe ser distinto del actual' : 'La nueva contraseña debe ser distinta de la actual');
    validarCredencial(user.rol, nueva);
    await this.users.update(user.id, { ...(await hashCredencial(user.rol, nueva)), debeCambiarCredencial: false, intentosFallidos: 0, bloqueadoHasta: null });
    await this.audit.log({ usuarioId: user.id, accion: 'CREDENCIAL_CAMBIADA', entidad: 'usuario', entidadId: user.id, detalle: { tipo } });
    return { ok: true };
  }
}
