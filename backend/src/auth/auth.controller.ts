import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, PermitidoSinCambio, Public, SessionUser } from '../common/auth.decorators';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() @MinLength(1) @MaxLength(60)
  usuario: string;

  /** Contraseña (Administrador/Autorizador) o PIN (Técnico/Operario). */
  @IsString() @MinLength(1) @MaxLength(128)
  credencial: string;
}

class ChangeCredentialDto {
  @IsString() @MinLength(1) @MaxLength(128)
  actual: string;

  @IsString() @MinLength(4) @MaxLength(128)
  nueva: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.usuario, dto.credencial, ip);
  }

  @Get('yo')
  @PermitidoSinCambio()
  yo(@CurrentUser() user: SessionUser) {
    return user;
  }

  /** Cada usuario cambia su propia contraseña o PIN (obligatorio al primer ingreso o tras un restablecimiento). */
  @Post('cambiar-credencial')
  @HttpCode(200)
  @PermitidoSinCambio()
  cambiar(@Body() dto: ChangeCredentialDto, @CurrentUser() user: SessionUser) {
    return this.auth.cambiarCredencial(user, dto.actual, dto.nueva);
  }
}
