import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Rol } from '../common/enums';

@Entity('usuarios')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  nombre: string;

  /** Nombre de usuario para iniciar sesión (único, en minúsculas). */
  @Column({ length: 60, unique: true })
  usuario: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ type: 'enum', enum: Rol, enumName: 'rol_usuario' })
  rol: Rol;

  /** Hash bcrypt de la contraseña (Administrador y Autorizador). */
  @Column({ name: 'password_hash', type: 'varchar', nullable: true, select: false })
  passwordHash: string | null;

  /** Hash bcrypt del PIN de planta (Técnico y Operario). */
  @Column({ name: 'pin_hash', type: 'varchar', nullable: true, select: false })
  pinHash: string | null;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'intentos_fallidos', default: 0 })
  intentosFallidos: number;

  @Column({ name: 'bloqueado_hasta', type: 'timestamptz', nullable: true })
  bloqueadoHasta: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
