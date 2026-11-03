import { MigrationInterface, QueryRunner } from "typeorm";

/** Formatos de mantenimiento de la planta: preoperacionales, verificaciones de cierre de la OT, hoja de vida, temperaturas e iluminación. */

export class FormatosMantenimiento1793712522975 implements MigrationInterface {
    name = 'FormatosMantenimiento1793712522975'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "verificaciones_temperatura" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "fecha" date NOT NULL, "area" character varying(100) NOT NULL, "observaciones" text, "usuario_id" uuid NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a646545a82bbe8677c477469e4a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_037bf9aa1f823dec88fc62e591" ON "verificaciones_temperatura" ("fecha", "area") `);
        await queryRunner.query(`CREATE TABLE "recintos_iluminacion" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nombre" character varying(150) NOT NULL, "minimo" integer NOT NULL, "promedio" integer NOT NULL, "maximo" integer NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_635ece32e5291448b7c3821a6f8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_55275b3fb41c5cf8a88cda8179" ON "recintos_iluminacion" ("nombre") `);
        await queryRunner.query(`CREATE TABLE "puntos_iluminacion" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nombre" character varying(120) NOT NULL, "recinto_id" uuid NOT NULL, "orden" integer NOT NULL DEFAULT '0', "vigente" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_acf65a8abf273ea064f8a78e554" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "mediciones_iluminacion" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "fecha" date NOT NULL, "empresa" character varying(60) NOT NULL, "lugar" character varying(120) NOT NULL, "evaluador" character varying(120) NOT NULL, "cargo_evaluador" character varying(120) NOT NULL, "observaciones" text, "puntos_cumplen" integer NOT NULL, "puntos_no_cumplen" integer NOT NULL, "usuario_id" uuid NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_050f0de6690780a83fbf0b3f656" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_562630c1f052ea5f1c09eb8ad7" ON "mediciones_iluminacion" ("fecha") `);
        await queryRunner.query(`CREATE TABLE "lecturas_iluminacion" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "medicion_id" uuid NOT NULL, "orden" integer NOT NULL, "punto_nombre" character varying(120) NOT NULL, "recinto_nombre" character varying(150) NOT NULL, "ref_minimo" integer NOT NULL, "ref_promedio" integer NOT NULL, "ref_maximo" integer NOT NULL, "medicion1" numeric(8,1) NOT NULL, "medicion2" numeric(8,1) NOT NULL, "medicion3" numeric(8,1) NOT NULL, "media" numeric(8,1) NOT NULL, "cumple" boolean NOT NULL, "plan_accion" text, "observaciones" text, CONSTRAINT "PK_7b0802980957ad86a40cd9703a6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_17abdef5fce4207317aa70b36a" ON "lecturas_iluminacion" ("medicion_id") `);
        await queryRunner.query(`CREATE TYPE "public"."clase_activo" AS ENUM('EQUIPO', 'INSTALACION')`);
        await queryRunner.query(`ALTER TABLE "activos" ADD "clase" "public"."clase_activo" NOT NULL DEFAULT 'EQUIPO'`);
        await queryRunner.query(`ALTER TABLE "activos" ADD "voltaje" character varying(40)`);
        await queryRunner.query(`ALTER TABLE "activos" ADD "amperaje" character varying(40)`);
        await queryRunner.query(`ALTER TABLE "activos" ADD "capacidad" character varying(60)`);
        await queryRunner.query(`ALTER TABLE "activos" ADD "peso" character varying(40)`);
        await queryRunner.query(`ALTER TABLE "activos" ADD "ubicacion_manual" character varying(150)`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD "verificaciones" jsonb`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD "observaciones" text`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" ADD "codigo" character varying(40)`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" ADD "version" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" ADD "fecha_elaboracion" date`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" ADD "fecha_actualizacion" date`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" ADD "recomendacion" text`);
        await queryRunner.query(`ALTER TABLE "verificaciones_temperatura" ADD CONSTRAINT "FK_2c832a6ac03738eb2088f719a19" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "puntos_iluminacion" ADD CONSTRAINT "FK_e8b98b4e15683446221c5ab172b" FOREIGN KEY ("recinto_id") REFERENCES "recintos_iluminacion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "mediciones_iluminacion" ADD CONSTRAINT "FK_6b5145cdda0f8246713066bb954" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lecturas_iluminacion" ADD CONSTRAINT "FK_17abdef5fce4207317aa70b36ae" FOREIGN KEY ("medicion_id") REFERENCES "mediciones_iluminacion"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        // Las mediciones de iluminación y el "verificó" de las temperaturas son registros de calidad: no se editan ni se borran.
        for (const t of ['mediciones_iluminacion', 'lecturas_iluminacion', 'verificaciones_temperatura']) {
            await queryRunner.query(`CREATE TRIGGER trg_${t}_inmutable BEFORE UPDATE OR DELETE ON "${t}" FOR EACH ROW EXECUTE FUNCTION fn_registro_inmutable()`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const t of ['mediciones_iluminacion', 'lecturas_iluminacion', 'verificaciones_temperatura']) {
            await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${t}_inmutable ON "${t}"`);
        }
        await queryRunner.query(`ALTER TABLE "lecturas_iluminacion" DROP CONSTRAINT "FK_17abdef5fce4207317aa70b36ae"`);
        await queryRunner.query(`ALTER TABLE "mediciones_iluminacion" DROP CONSTRAINT "FK_6b5145cdda0f8246713066bb954"`);
        await queryRunner.query(`ALTER TABLE "puntos_iluminacion" DROP CONSTRAINT "FK_e8b98b4e15683446221c5ab172b"`);
        await queryRunner.query(`ALTER TABLE "verificaciones_temperatura" DROP CONSTRAINT "FK_2c832a6ac03738eb2088f719a19"`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" DROP COLUMN "recomendacion"`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" DROP COLUMN "fecha_actualizacion"`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" DROP COLUMN "fecha_elaboracion"`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" DROP COLUMN "version"`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" DROP COLUMN "codigo"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP COLUMN "observaciones"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP COLUMN "verificaciones"`);
        await queryRunner.query(`ALTER TABLE "activos" DROP COLUMN "ubicacion_manual"`);
        await queryRunner.query(`ALTER TABLE "activos" DROP COLUMN "peso"`);
        await queryRunner.query(`ALTER TABLE "activos" DROP COLUMN "capacidad"`);
        await queryRunner.query(`ALTER TABLE "activos" DROP COLUMN "amperaje"`);
        await queryRunner.query(`ALTER TABLE "activos" DROP COLUMN "voltaje"`);
        await queryRunner.query(`ALTER TABLE "activos" DROP COLUMN "clase"`);
        await queryRunner.query(`DROP TYPE "public"."clase_activo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_17abdef5fce4207317aa70b36a"`);
        await queryRunner.query(`DROP TABLE "lecturas_iluminacion"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_562630c1f052ea5f1c09eb8ad7"`);
        await queryRunner.query(`DROP TABLE "mediciones_iluminacion"`);
        await queryRunner.query(`DROP TABLE "puntos_iluminacion"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_55275b3fb41c5cf8a88cda8179"`);
        await queryRunner.query(`DROP TABLE "recintos_iluminacion"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_037bf9aa1f823dec88fc62e591"`);
        await queryRunner.query(`DROP TABLE "verificaciones_temperatura"`);
    }

}
