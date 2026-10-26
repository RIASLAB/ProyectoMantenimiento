import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Rol } from '../common/enums';

/**
 * D-11 (asumido): Administrador y Autorizador ingresan con contraseña;
 * Técnico y Operario ingresan con un PIN numérico, más práctico en planta.
 */
export function usaPin(rol: Rol): boolean {
  return rol === Rol.TECNICO || rol === Rol.OPERARIO;
}

export const PIN_REGEX = /^\d{4,6}$/;
export const MIN_PASSWORD = 8;

export function validarCredencial(rol: Rol, credencial: string): void {
  if (usaPin(rol)) {
    if (!PIN_REGEX.test(credencial)) throw new BadRequestException('El PIN debe tener de 4 a 6 dígitos');
    if (/^(\d)\1+$/.test(credencial) || ['1234', '12345', '123456', '0123'].includes(credencial)) {
      throw new BadRequestException('El PIN es demasiado fácil de adivinar');
    }
  } else if (credencial.length < MIN_PASSWORD || !/[A-Za-z]/.test(credencial) || !/\d/.test(credencial)) {
    throw new BadRequestException(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres, con letras y números`);
  }
}

export async function hashCredencial(rol: Rol, credencial: string) {
  const hash = await bcrypt.hash(credencial, 12);
  return usaPin(rol) ? { pinHash: hash, passwordHash: null } : { passwordHash: hash, pinHash: null };
}
