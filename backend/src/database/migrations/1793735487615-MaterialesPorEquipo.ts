import { MigrationInterface, QueryRunner } from "typeorm";

export class MaterialesPorEquipo1793735487615 implements MigrationInterface {
    name = 'MaterialesPorEquipo1793735487615'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "activo_materiales" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "activo_id" uuid NOT NULL, "repuesto_id" uuid NOT NULL, "cantidad" numeric(14,3) NOT NULL, CONSTRAINT "PK_a2fe07ad85e20267b10511f1a6c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_beb4c861ef0e55a7e8e9697a77" ON "activo_materiales" ("activo_id", "repuesto_id") `);
        await queryRunner.query(`ALTER TABLE "activo_materiales" ADD CONSTRAINT "FK_6d4610e2d21f3eb70dc461cef26" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activo_materiales" ADD CONSTRAINT "FK_139284a512e17475a33ec7814ed" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activo_materiales" DROP CONSTRAINT "FK_139284a512e17475a33ec7814ed"`);
        await queryRunner.query(`ALTER TABLE "activo_materiales" DROP CONSTRAINT "FK_6d4610e2d21f3eb70dc461cef26"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_beb4c861ef0e55a7e8e9697a77"`);
        await queryRunner.query(`DROP TABLE "activo_materiales"`);
    }

}
