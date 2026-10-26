import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Public, SessionUser } from '../common/auth.decorators';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() @MinLength(1) @MaxLength(60)
  usuario: string;

  /** Contraseña (Administrador/Autorizador) o PIN (Técnico/Operario). */
  @IsString() @MinLength(1) @MaxLength(128)
  credencial: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.usuario, dto.credencial);
  }

  @Get('yo')
  yo(@CurrentUser() user: SessionUser) {
    return user;
  }
}
