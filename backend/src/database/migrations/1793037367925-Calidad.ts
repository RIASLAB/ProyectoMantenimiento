import { MigrationInterface, QueryRunner } from "typeorm";

export class Calidad1793037367925 implements MigrationInterface {
    name = 'Calidad1793037367925'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "puntos_control" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "activo_id" uuid NOT NULL, "nombre" character varying(120) NOT NULL, "minimo" numeric(6,2), "maximo" numeric(6,2), "frecuencia_horas" integer, "vigente" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2ce541e966502b8288eb547156f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "registros_temperatura" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "punto_id" uuid NOT NULL, "activo_id" uuid NOT NULL, "valor" numeric(6,2) NOT NULL, "limite_minimo" numeric(6,2), "limite_maximo" numeric(6,2), "fuera_de_rango" boolean NOT NULL, "accion_correctiva" text, "registrado_en" TIMESTAMP WITH TIME ZONE NOT NULL, "usuario_id" uuid NOT NULL, "client_id" uuid, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d15618410f2506df65662191583" UNIQUE ("client_id"), CONSTRAINT "PK_a7b6163aef063fe08f0ea995448" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_da5a8adaf0b4558522e061e396" ON "registros_temperatura" ("punto_id", "registrado_en") `);
        await queryRunner.query(`CREATE INDEX "IDX_a2bead18e1c85a884fe2136922" ON "registros_temperatura" ("registrado_en") `);
        await queryRunner.query(`CREATE TABLE "plantillas_checklist" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nombre" character varying(150) NOT NULL, "area" character varying(100), "activo_id" uuid, "descripcion" text, "items" jsonb NOT NULL, "vigente" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_def343229e498dace86cac38844" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "registros_checklist" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "plantilla_id" uuid NOT NULL, "plantilla_nombre" character varying(150) NOT NULL, "activo_id" uuid, "respuestas" jsonb NOT NULL, "no_conformes" integer NOT NULL, "observaciones" text, "accion_correctiva" text, "registrado_en" TIMESTAMP WITH TIME ZONE NOT NULL, "usuario_id" uuid NOT NULL, "client_id" uuid, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_da1c9e078bd5d94e376a29f36d4" UNIQUE ("client_id"), CONSTRAINT "PK_25e97f93c279fcc4aad44a4ab76" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_82ae7de451af62b47fcf02e278" ON "registros_checklist" ("registrado_en") `);
        await queryRunner.query(`CREATE TABLE "anulaciones_calidad" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tipo" character varying(20) NOT NULL, "registro_id" uuid NOT NULL, "motivo" character varying(500) NOT NULL, "usuario_id" uuid NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c031e269b9ee676997b9e523f19" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f5b5ee1557f4a3ec42084db71e" ON "anulaciones_calidad" ("tipo", "registro_id") `);
        await queryRunner.query(`ALTER TABLE "puntos_control" ADD CONSTRAINT "FK_24308692ce60538f1a5ffa06c56" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" ADD CONSTRAINT "FK_e8e0514ccfe521f71563eead67a" FOREIGN KEY ("punto_id") REFERENCES "puntos_control"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" ADD CONSTRAINT "FK_cb5bf85469a9fe304ca9dbeb097" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" ADD CONSTRAINT "FK_0114a03061fcfaec074f12cba84" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "registros_checklist" ADD CONSTRAINT "FK_a4b89993e546205ba841c79eeda" FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_checklist"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "registros_checklist" ADD CONSTRAINT "FK_e01c621970cd45efb68597927dd" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "registros_checklist" ADD CONSTRAINT "FK_83ebf8b191ee5c3207f8e53c525" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "anulaciones_calidad" ADD CONSTRAINT "FK_661af6e562447128c0b2b965fc3" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        // Registros de calidad y sus anulaciones: solo inserción (CAL-05)
        for (const t of ['registros_temperatura', 'registros_checklist', 'anulaciones_calidad']) {
            await queryRunner.query(`CREATE TRIGGER trg_${t}_inmutable BEFORE UPDATE OR DELETE ON "${t}" FOR EACH ROW EXECUTE FUNCTION fn_registro_inmutable()`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const t of ['registros_temperatura', 'registros_checklist', 'anulaciones_calidad']) {
            await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${t}_inmutable ON "${t}"`);
        }
        await queryRunner.query(`ALTER TABLE "anulaciones_calidad" DROP CONSTRAINT "FK_661af6e562447128c0b2b965fc3"`);
        await queryRunner.query(`ALTER TABLE "registros_checklist" DROP CONSTRAINT "FK_83ebf8b191ee5c3207f8e53c525"`);
        await queryRunner.query(`ALTER TABLE "registros_checklist" DROP CONSTRAINT "FK_e01c621970cd45efb68597927dd"`);
        await queryRunner.query(`ALTER TABLE "registros_checklist" DROP CONSTRAINT "FK_a4b89993e546205ba841c79eeda"`);
        await queryRunner.query(`ALTER TABLE "plantillas_checklist" DROP CONSTRAINT "FK_0114a03061fcfaec074f12cba84"`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" DROP CONSTRAINT "FK_cb5bf85469a9fe304ca9dbeb097"`);
        await queryRunner.query(`ALTER TABLE "registros_temperatura" DROP CONSTRAINT "FK_e8e0514ccfe521f71563eead67a"`);
        await queryRunner.query(`ALTER TABLE "puntos_control" DROP CONSTRAINT "FK_24308692ce60538f1a5ffa06c56"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f5b5ee1557f4a3ec42084db71e"`);
        await queryRunner.query(`DROP TABLE "anulaciones_calidad"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_82ae7de451af62b47fcf02e278"`);
        await queryRunner.query(`DROP TABLE "registros_checklist"`);
        await queryRunner.query(`DROP TABLE "plantillas_checklist"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a2bead18e1c85a884fe2136922"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_da5a8adaf0b4558522e061e396"`);
        await queryRunner.query(`DROP TABLE "registros_temperatura"`);
        await queryRunner.query(`DROP TABLE "puntos_control"`);
    }

}
