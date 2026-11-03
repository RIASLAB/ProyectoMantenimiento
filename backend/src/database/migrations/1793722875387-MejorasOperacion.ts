import { MigrationInterface, QueryRunner } from "typeorm";

/** Avisos de checklists diarios, firmas en los formatos, calibración de instrumentos y cambio de credencial al primer ingreso. */

export class MejorasOperacion1793722875387 implements MigrationInterface {
    name = 'MejorasOperacion1793722875387'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "instrumentos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "codigo" character varying(40) NOT NULL, "nombre" character varying(150) NOT NULL, "tipo" character varying(20) NOT NULL, "marca" character varying(100), "modelo" character varying(100), "serie" character varying(100), "area" character varying(100) NOT NULL, "ubicacion" character varying(150), "rango" character varying(120), "frecuencia_meses" integer NOT NULL, "vigente" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7604d50567151ce7414b48aad7c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_94798ee3a5ab7d2841b58a6f35" ON "instrumentos" ("codigo") `);
        await queryRunner.query(`CREATE TABLE "calibraciones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "instrumento_id" uuid NOT NULL, "fecha" date NOT NULL, "vence_en" date NOT NULL, "laboratorio" character varying(150) NOT NULL, "numero_certificado" character varying(80), "resultado" character varying(10) NOT NULL, "observaciones" text, "archivo_ruta" character varying(300), "archivo_nombre" character varying(200), "archivo_mime" character varying(100), "usuario_id" uuid NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b54363858847e8ae6d1ef189d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_212126cc6bbf72c76e8845dfb0" ON "calibraciones" ("instrumento_id", "fecha") `);
        await queryRunner.query(`CREATE TABLE "firmas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "entidad" character varying(20) NOT NULL, "entidad_id" character varying(150) NOT NULL, "casilla" character varying(40) NOT NULL, "nombre" character varying(120) NOT NULL, "cargo" character varying(120), "imagen" text NOT NULL, "usuario_id" uuid NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f23280135a669df3bf32824f223" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f075c9deaf81ba71d83f9c13c3" ON "firmas" ("entidad", "entidad_id", "casilla") `);
        await queryRunner.query(`ALTER TABLE "usuarios" ADD "debe_cambiar_credencial" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" ADD "recordar_hora" integer`);
        await queryRunner.query(`ALTER TABLE "calibraciones" ADD CONSTRAINT "FK_79a2eb19be6623c26d1d7535ed0" FOREIGN KEY ("instrumento_id") REFERENCES "instrumentos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "calibraciones" ADD CONSTRAINT "FK_17410999f85959b06aa7766e7cb" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "firmas" ADD CONSTRAINT "FK_8c773874894c9736fb933edd4e8" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        // Las firmas y las calibraciones son registros de calidad: no se editan ni se borran.
        for (const t of ['firmas', 'calibraciones']) {
            await queryRunner.query(`CREATE TRIGGER trg_${t}_inmutable BEFORE UPDATE OR DELETE ON "${t}" FOR EACH ROW EXECUTE FUNCTION fn_registro_inmutable()`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const t of ['firmas', 'calibraciones']) {
            await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${t}_inmutable ON "${t}"`);
        }
        await queryRunner.query(`ALTER TABLE "firmas" DROP CONSTRAINT "FK_8c773874894c9736fb933edd4e8"`);
        await queryRunner.query(`ALTER TABLE "calibraciones" DROP CONSTRAINT "FK_17410999f85959b06aa7766e7cb"`);
        await queryRunner.query(`ALTER TABLE "calibraciones" DROP CONSTRAINT "FK_79a2eb19be6623c26d1d7535ed0"`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" DROP COLUMN "recordar_hora"`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "debe_cambiar_credencial"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f075c9deaf81ba71d83f9c13c3"`);
        await queryRunner.query(`DROP TABLE "firmas"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_212126cc6bbf72c76e8845dfb0"`);
        await queryRunner.query(`DROP TABLE "calibraciones"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_94798ee3a5ab7d2841b58a6f35"`);
        await queryRunner.query(`DROP TABLE "instrumentos"`);
    }

}
