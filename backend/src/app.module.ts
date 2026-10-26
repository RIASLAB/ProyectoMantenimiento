import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsController } from './assets/assets.controller';
import { AssetsService } from './assets/assets.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { Public } from './common/auth.decorators';
import { dataSourceOptions, ENTITIES } from './database/data-source';
import { InventoryController, SparePartsController } from './inventory/inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { AssetHistoryController, PlansController, WorkOrdersController } from './maintenance/maintenance.controller';
import { MaintenanceService } from './maintenance/maintenance.service';
import { PurchasesController } from './purchases/purchases.controller';
import { PurchasesService } from './purchases/purchases.service';
import { QualityController } from './quality/quality.controller';
import { QualityService } from './quality/quality.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Controller('salud')
class HealthController {
  @Public()
  @Get()
  ok() {
    return { estado: 'ok' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => dataSourceOptions(c.getOrThrow('DATABASE_URL')),
    }),
    TypeOrmModule.forFeature(ENTITIES),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const secret = c.getOrThrow<string>('JWT_SECRET');
        if (process.env.NODE_ENV === 'production' && (secret.length < 32 || secret.startsWith('cambiar'))) {
          throw new Error('JWT_SECRET debe ser un valor aleatorio de al menos 32 caracteres en producción');
        }
        return { secret, signOptions: { expiresIn: c.get('JWT_EXPIRES_IN', '8h') } };
      },
    }),
  ],
  controllers: [
    HealthController, AuthController, UsersController, SettingsController, AuditController,
    AssetHistoryController, AssetsController, SparePartsController, InventoryController, WorkOrdersController, PlansController, PurchasesController, QualityController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService, UsersService, SettingsService, AuditService, AssetsService, InventoryService, MaintenanceService, PurchasesService, QualityService,
  ],
})
export class AppModule {}
