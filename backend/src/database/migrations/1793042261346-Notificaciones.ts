import { MigrationInterface, QueryRunner } from "typeorm";

export class Notificaciones1793042261346 implements MigrationInterface {
    name = 'Notificaciones1793042261346'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "notificaciones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "usuario_id" uuid NOT NULL, "tipo" character varying(40) NOT NULL, "titulo" character varying(150) NOT NULL, "cuerpo" character varying(500), "enlace" character varying(200), "clave" character varying(120), "leida_en" TIMESTAMP WITH TIME ZONE, "push_pendiente" boolean NOT NULL DEFAULT false, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a9d32a419ff58b53a38b5ef85d4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fd3a777f39405289be81bddd31" ON "notificaciones" ("push_pendiente") WHERE push_pendiente`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a48c9bfc7cc26dca2fea94f341" ON "notificaciones" ("usuario_id", "clave") WHERE clave IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_beadd2108de985be4a84a6cb3a" ON "notificaciones" ("usuario_id", "creado_en") `);
        await queryRunner.query(`CREATE TABLE "suscripciones_push" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "usuario_id" uuid NOT NULL, "endpoint" character varying(1000) NOT NULL, "p256dh" character varying(200) NOT NULL, "auth" character varying(100) NOT NULL, "agente" character varying(300), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2a94f1283f8129f8e46a172d162" UNIQUE ("endpoint"), CONSTRAINT "PK_937c34a7cb5f1f2a949a22fbc2e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c129ad13166bbc967a581beaf6" ON "suscripciones_push" ("usuario_id") `);
        await queryRunner.query(`ALTER TABLE "notificaciones" ADD CONSTRAINT "FK_2c6341d5bd206ff522b35aa6b69" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "suscripciones_push" ADD CONSTRAINT "FK_c129ad13166bbc967a581beaf6f" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suscripciones_push" DROP CONSTRAINT "FK_c129ad13166bbc967a581beaf6f"`);
        await queryRunner.query(`ALTER TABLE "notificaciones" DROP CONSTRAINT "FK_2c6341d5bd206ff522b35aa6b69"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c129ad13166bbc967a581beaf6"`);
        await queryRunner.query(`DROP TABLE "suscripciones_push"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_beadd2108de985be4a84a6cb3a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a48c9bfc7cc26dca2fea94f341"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd3a777f39405289be81bddd31"`);
        await queryRunner.query(`DROP TABLE "notificaciones"`);
    }

}
