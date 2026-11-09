import { MigrationInterface, QueryRunner } from "typeorm";

export class DescansoYDanadoEnTemperaturas1794258289085 implements MigrationInterface {
    name = 'DescansoYDanadoEnTemperaturas1794258289085'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "registros_temperatura" ADD "estado" character varying(12) NOT NULL DEFAULT 'LECTURA'`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" ADD "observacion" text`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" ALTER COLUMN "valor" DROP NOT NULL`);
        // D-37: una lectura lleva temperatura; descanso o dañado no. Dañado lleva qué tiene.
        await queryRunner.query(`ALTER TABLE "registros_temperatura" ADD CONSTRAINT "CHK_temperatura_estado" CHECK (
          (estado = 'LECTURA' AND valor IS NOT NULL) OR (estado = 'DESCANSO' AND valor IS NULL) OR (estado = 'DANADO' AND valor IS NULL AND observacion IS NOT NULL))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "registros_temperatura" DROP CONSTRAINT "CHK_temperatura_estado"`);
        await queryRunner.query(`DELETE FROM "registros_temperatura" WHERE valor IS NULL`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" ALTER COLUMN "valor" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" DROP COLUMN "observacion"`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" DROP COLUMN "estado"`);
    }

}
