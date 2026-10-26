import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { usaPin } from '../users/credentials';
import { User } from '../users/user.entity';

export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
const MENSAJE_GENERICO = 'Usuario o credencial incorrectos';
const HASH_FICTICIO = bcrypt.hashSync('credencial-ficticia', 12);

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(usuario: string, credencial: string) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.pinHash'])
      .where('u.usuario = :usuario', { usuario: usuario.trim().toLowerCase() })
      .getOne();

    // Mismo mensaje para usuario inexistente o credencial errada: no revela qué usuarios existen.
    if (!user || !user.activo) {
      await bcrypt.compare(credencial, HASH_FICTICIO); // mantiene el tiempo de respuesta similar
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
      throw new UnauthorizedException(MENSAJE_GENERICO);
    }

    if (user.intentosFallidos > 0 || user.bloqueadoHasta) {
      await this.users.update(user.id, { intentosFallidos: 0, bloqueadoHasta: null });
    }

    const token = await this.jwt.signAsync({ sub: user.id, rol: user.rol });
    return {
      token,
      usuario: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol },
    };
  }
}
