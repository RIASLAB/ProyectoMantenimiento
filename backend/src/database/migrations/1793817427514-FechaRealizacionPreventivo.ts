import { MigrationInterface, QueryRunner } from "typeorm";

export class FechaRealizacionPreventivo1793817427514 implements MigrationInterface {
    name = 'FechaRealizacionPreventivo1793817427514'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD "fecha_realizacion" date`);
        // D-33: los preventivos ya cerrados quedan con el día en que se cerraron.
        await queryRunner.query(`UPDATE "ordenes_trabajo" SET "fecha_realizacion" = (cerrada_en AT TIME ZONE 'America/Bogota')::date WHERE tipo = 'PREVENTIVO' AND estado = 'CERRADA' AND cerrada_en IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP COLUMN "fecha_realizacion"`);
    }

}
