import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Rol } from '../common/enums';

export class CreateUserDto {
  @IsString() @MinLength(3) @MaxLength(120)
  nombre: string;

  @IsString() @Matches(/^[a-zA-Z0-9._-]{3,60}$/, { message: 'El usuario solo admite letras, números, punto, guion y guion bajo (3 a 60)' })
  usuario: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsEnum(Rol)
  rol: Rol;

  /** Contraseña o PIN inicial según el rol. */
  @IsString() @MaxLength(128)
  credencial: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  nombre?: string;

  @IsOptional() @IsEmail()
  email?: string | null;

  /** Al cambiar entre un rol de contraseña y uno de PIN se debe enviar también la nueva credencial. */
  @IsOptional() @IsEnum(Rol)
  rol?: Rol;

  @IsOptional() @IsString() @MaxLength(128)
  credencial?: string;

  @IsOptional() @IsBoolean()
  activo?: boolean;
}
