import { MigrationInterface, QueryRunner } from 'typeorm';

/** Máquinas compradas que quedan en bodega sin instalar (inventario de equipos). */
export class EquiposEnBodega1793230000000 implements MigrationInterface {
  name = 'EquiposEnBodega1793230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."estado_activo" ADD VALUE IF NOT EXISTS 'EN_BODEGA'`);
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite quitar un valor de un tipo enumerado; dejarlo no afecta a versiones anteriores.
  }
}
