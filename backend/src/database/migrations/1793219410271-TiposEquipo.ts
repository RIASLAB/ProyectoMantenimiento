import { MigrationInterface, QueryRunner } from "typeorm";

export class TiposEquipo1793219410271 implements MigrationInterface {
    name = 'TiposEquipo1793219410271'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "categorias_equipo" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nombre" character varying(100) NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6c368af2b75324cc045fd43c3d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6dab4a2343092a56a693afbb6a" ON "categorias_equipo" ("nombre") `);
        await queryRunner.query(`CREATE TABLE "modelos_equipo" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "categoria_id" uuid NOT NULL, "nombre" character varying(120) NOT NULL, "fabricante" character varying(100), "referencia" character varying(100), "descripcion" text, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d3abf53539af4e9121bb6398f28" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f5b5383503c2d25d2ed5d8dcfd" ON "modelos_equipo" ("nombre") `);
        await queryRunner.query(`CREATE TABLE "modelo_materiales" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "modelo_id" uuid NOT NULL, "repuesto_id" uuid NOT NULL, "cantidad" numeric(14,3) NOT NULL, CONSTRAINT "PK_4e4ed22cddfb6a9d2eb61111e79" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9289a164b337ca750592050bb2" ON "modelo_materiales" ("modelo_id", "repuesto_id") `);
        await queryRunner.query(`ALTER TABLE "activos" ADD "modelo_id" uuid`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD "modelo_id" uuid`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD "plantilla_id" uuid`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD "primera_fecha" date`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "FK_bc546d35078725304243296e99a"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ALTER COLUMN "activo_id" DROP NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_f7ba2cfea8a8b107134f2b3579" ON "activos" ("modelo_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_601651341f0fbc273afd1ef84a" ON "planes_mantenimiento" ("plantilla_id") `);
        await queryRunner.query(`ALTER TABLE "modelos_equipo" ADD CONSTRAINT "FK_958445335945e6e6017f9bf2f21" FOREIGN KEY ("categoria_id") REFERENCES "categorias_equipo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "modelo_materiales" ADD CONSTRAINT "FK_4104a3eb63c00e48bd455f70d79" FOREIGN KEY ("modelo_id") REFERENCES "modelos_equipo"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "modelo_materiales" ADD CONSTRAINT "FK_86a4aa8006d603dcbfc8b0f77e9" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activos" ADD CONSTRAINT "FK_f7ba2cfea8a8b107134f2b35795" FOREIGN KEY ("modelo_id") REFERENCES "modelos_equipo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "FK_bc546d35078725304243296e99a" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "FK_402db988695c2bd55494ea674c6" FOREIGN KEY ("modelo_id") REFERENCES "modelos_equipo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "FK_601651341f0fbc273afd1ef84a6" FOREIGN KEY ("plantilla_id") REFERENCES "planes_mantenimiento"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        // Un plan es de una máquina o de un tipo de equipo, nunca de los dos ni de ninguno.
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "CHK_plan_maquina_o_tipo" CHECK ((activo_id IS NULL) <> (modelo_id IS NULL))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "CHK_plan_maquina_o_tipo"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "FK_601651341f0fbc273afd1ef84a6"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "FK_402db988695c2bd55494ea674c6"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "FK_bc546d35078725304243296e99a"`);
        await queryRunner.query(`ALTER TABLE "activos" DROP CONSTRAINT "FK_f7ba2cfea8a8b107134f2b35795"`);
        await queryRunner.query(`ALTER TABLE "modelo_materiales" DROP CONSTRAINT "FK_86a4aa8006d603dcbfc8b0f77e9"`);
        await queryRunner.query(`ALTER TABLE "modelo_materiales" DROP CONSTRAINT "FK_4104a3eb63c00e48bd455f70d79"`);
        await queryRunner.query(`ALTER TABLE "modelos_equipo" DROP CONSTRAINT "FK_958445335945e6e6017f9bf2f21"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_601651341f0fbc273afd1ef84a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f7ba2cfea8a8b107134f2b3579"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ALTER COLUMN "activo_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "FK_bc546d35078725304243296e99a" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP COLUMN "primera_fecha"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP COLUMN "plantilla_id"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP COLUMN "modelo_id"`);
        await queryRunner.query(`ALTER TABLE "activos" DROP COLUMN "modelo_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9289a164b337ca750592050bb2"`);
        await queryRunner.query(`DROP TABLE "modelo_materiales"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f5b5383503c2d25d2ed5d8dcfd"`);
        await queryRunner.query(`DROP TABLE "modelos_equipo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6dab4a2343092a56a693afbb6a"`);
        await queryRunner.query(`DROP TABLE "categorias_equipo"`);
    }

}
