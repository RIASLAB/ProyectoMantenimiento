import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AssetDocument } from '../assets/asset-document.entity';
import { Asset } from '../assets/asset.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { InventoryMovement } from '../inventory/inventory-movement.entity';
import { SparePart } from '../inventory/spare-part.entity';
import { MAINTENANCE_ENTITIES } from '../maintenance/maintenance.entities';
import { EQUIPMENT_ENTITIES } from '../equipment/equipment.entities';
import { NOTIFICATION_ENTITIES } from '../notifications/notification.entities';
import { PurchaseRequest } from '../purchases/purchase-request.entity';
import { QUALITY_ENTITIES } from '../quality/quality.entities';
import { Setting } from '../settings/setting.entity';
import { User } from '../users/user.entity';

dotenv.config();

export const ENTITIES = [User, AuditLog, Setting, Asset, AssetDocument, SparePart, InventoryMovement, ...MAINTENANCE_ENTITIES, PurchaseRequest, ...QUALITY_ENTITIES, ...NOTIFICATION_ENTITIES, ...EQUIPMENT_ENTITIES];

export function dataSourceOptions(url = process.env.DATABASE_URL): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    // gen_random_uuid() viene incluido en PostgreSQL 13+; no requiere extensiones.
    uuidExtension: 'pgcrypto',
    entities: ENTITIES,
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    // Nunca sincronizar automáticamente: todos los cambios de esquema van por migraciones.
    synchronize: false,
  };
}

export default new DataSource(dataSourceOptions());
