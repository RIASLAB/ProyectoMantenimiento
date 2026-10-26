import { MigrationInterface, QueryRunner } from 'typeorm';

/** INT-01: tipo de movimiento "saldo inicial" para la carga masiva de repuestos. */
export class SaldoInicial1793051589864 implements MigrationInterface {
  name = 'SaldoInicial1793051589864';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar el valor no reescribe la tabla de movimientos (que es inmutable).
    await queryRunner.query(`ALTER TYPE "public"."tipo_movimiento" ADD VALUE IF NOT EXISTS 'ENTRADA_INICIAL' AFTER 'ENTRADA_COMPRA'`);
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite quitar un valor de un tipo enumerado; dejarlo no afecta a versiones anteriores.
  }
}
