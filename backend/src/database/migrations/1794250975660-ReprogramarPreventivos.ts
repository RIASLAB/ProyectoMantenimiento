import { MigrationInterface, QueryRunner } from "typeorm";

export class ReprogramarPreventivos1794250975660 implements MigrationInterface {
    name = 'ReprogramarPreventivos1794250975660'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ot_reprogramaciones" ("id" BIGSERIAL NOT NULL, "orden_id" uuid NOT NULL, "fecha_anterior" date NOT NULL, "fecha_nueva" date NOT NULL, "motivo" character varying(300) NOT NULL, "usuario_id" uuid NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4b95ded8075ffbcb2be35964225" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "ot_reprogramaciones" ADD CONSTRAINT "FK_af8b471de43d657019db31164e6" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_reprogramaciones" ADD CONSTRAINT "FK_7230f7b76293a4158823f959c9d" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE INDEX "IDX_ot_reprogramaciones_orden" ON "ot_reprogramaciones" ("orden_id")`);
        // Solo inserción, como el historial de la OT; ambos se pueden borrar solo al eliminar una máquina sin historial (D-35).
        await queryRunner.query(`CREATE TRIGGER trg_ot_reprogramaciones_inmutable BEFORE UPDATE OR DELETE ON "ot_reprogramaciones" FOR EACH ROW EXECUTE FUNCTION fn_registro_inmutable()`);
        await queryRunner.query(`
          CREATE OR REPLACE FUNCTION fn_registro_inmutable() RETURNS trigger AS $$
          BEGIN
            IF TG_TABLE_NAME IN ('ot_eventos', 'ot_reprogramaciones') AND TG_OP = 'DELETE'
               AND current_setting('cmms.borrar_maquina_sin_historial', true) = 'on' THEN
              RETURN OLD;
            END IF;
            RAISE EXCEPTION 'La tabla % es de solo inserción: no se permite %', TG_TABLE_NAME, TG_OP;
          END;
          $$ LANGUAGE plpgsql;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_ot_reprogramaciones_inmutable ON "ot_reprogramaciones"`);
        await queryRunner.query(`ALTER TABLE "ot_reprogramaciones" DROP CONSTRAINT "FK_7230f7b76293a4158823f959c9d"`);
        await queryRunner.query(`ALTER TABLE "ot_reprogramaciones" DROP CONSTRAINT "FK_af8b471de43d657019db31164e6"`);
        await queryRunner.query(`DROP TABLE "ot_reprogramaciones"`);
    }

}
