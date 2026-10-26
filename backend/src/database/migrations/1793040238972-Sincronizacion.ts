import { MigrationInterface, QueryRunner } from "typeorm";

export class Sincronizacion1793040238972 implements MigrationInterface {
    name = 'Sincronizacion1793040238972'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD "cierre_client_id" uuid`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "UQ_a964626a3d0b332e6f97e488cf7" UNIQUE ("cierre_client_id")`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD "cerrada_sin_conexion" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "ot_fotos" ADD "client_id" uuid`);
        await queryRunner.query(`ALTER TABLE "ot_fotos" ADD CONSTRAINT "UQ_f71ca98d8f6a7a8097b3a1dbe22" UNIQUE ("client_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ot_fotos" DROP CONSTRAINT "UQ_f71ca98d8f6a7a8097b3a1dbe22"`);
        await queryRunner.query(`ALTER TABLE "ot_fotos" DROP COLUMN "client_id"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP COLUMN "cerrada_sin_conexion"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "UQ_a964626a3d0b332e6f97e488cf7"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP COLUMN "cierre_client_id"`);
    }

}
