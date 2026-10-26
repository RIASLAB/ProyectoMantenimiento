import { MigrationInterface, QueryRunner } from "typeorm";

export class OrdenesTrabajo1793035080018 implements MigrationInterface {
    name = 'OrdenesTrabajo1793035080018'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."unidad_frecuencia" AS ENUM('DIAS', 'SEMANAS', 'MESES')`);
        await queryRunner.query(`CREATE TABLE "planes_mantenimiento" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "activo_id" uuid NOT NULL, "nombre" character varying(150) NOT NULL, "tareas" text, "frecuencia_valor" integer NOT NULL, "frecuencia_unidad" "public"."unidad_frecuencia" NOT NULL, "dias_aviso" integer NOT NULL DEFAULT '7', "tecnico_id" uuid, "vigente" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f32908d68d1096c2021643b7e49" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "plan_repuestos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "plan_id" uuid NOT NULL, "repuesto_id" uuid NOT NULL, "cantidad" numeric(14,3) NOT NULL, CONSTRAINT "PK_3e65ea8427297d6a1df0a95a209" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tipo_orden" AS ENUM('CORRECTIVO', 'PREVENTIVO')`);
        await queryRunner.query(`CREATE TYPE "public"."estado_orden" AS ENUM('ABIERTA', 'ASIGNADA', 'EN_EJECUCION', 'ESPERANDO_REPUESTO', 'CERRADA', 'CANCELADA')`);
        await queryRunner.query(`CREATE TYPE "public"."prioridad_orden" AS ENUM('BAJA', 'MEDIA', 'ALTA')`);
        await queryRunner.query(`CREATE TABLE "ordenes_trabajo" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "numero" SERIAL NOT NULL, "tipo" "public"."tipo_orden" NOT NULL, "estado" "public"."estado_orden" NOT NULL DEFAULT 'ABIERTA', "prioridad" "public"."prioridad_orden" NOT NULL DEFAULT 'MEDIA', "activo_id" uuid NOT NULL, "plan_id" uuid, "descripcion" text NOT NULL, "fecha_programada" date, "maquina_parada" boolean NOT NULL DEFAULT false, "inicio_parada" TIMESTAMP WITH TIME ZONE, "fin_parada" TIMESTAMP WITH TIME ZONE, "reportado_por_id" uuid, "asignado_a_id" uuid, "iniciada_en" TIMESTAMP WITH TIME ZONE, "cerrada_en" TIMESTAMP WITH TIME ZONE, "cerrada_por_id" uuid, "trabajo_realizado" text, "costo_servicios_externos" numeric(14,2) NOT NULL DEFAULT '0', "costo_repuestos" numeric(14,2) NOT NULL DEFAULT '0', "costo_mano_obra" numeric(14,2) NOT NULL DEFAULT '0', "motivo_cancelacion" character varying(300), "client_id" uuid, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_95e918883617824d172daf42cea" UNIQUE ("numero"), CONSTRAINT "UQ_b0448d1947edcc6c2d52399becd" UNIQUE ("client_id"), CONSTRAINT "PK_5f8d68249311211057d4ab1fbbb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3e39d2d06f8f3809279d3e8049" ON "ordenes_trabajo" ("estado") `);
        await queryRunner.query(`CREATE INDEX "IDX_3f90901dc8f642b11bff8a8d2f" ON "ordenes_trabajo" ("activo_id", "creado_en") `);
        await queryRunner.query(`CREATE TABLE "ot_repuestos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orden_id" uuid NOT NULL, "repuesto_id" uuid NOT NULL, "cantidad_planificada" numeric(14,3) NOT NULL DEFAULT '0', "cantidad_usada" numeric(14,3), "costo_unitario" numeric(14,2), CONSTRAINT "PK_336483b4930eff1037596dc1588" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ot_mano_obra" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orden_id" uuid NOT NULL, "tecnico_id" uuid NOT NULL, "horas" numeric(8,2) NOT NULL, "tarifa_hora" numeric(14,2) NOT NULL, CONSTRAINT "PK_20a648c63f1467b9bb51a802e3f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ot_eventos" ("id" BIGSERIAL NOT NULL, "orden_id" uuid NOT NULL, "usuario_id" uuid, "estado_anterior" "public"."estado_orden", "estado_nuevo" "public"."estado_orden" NOT NULL, "nota" character varying(500), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_580069c8fff1bdc89630d4b61c3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."momento_foto" AS ENUM('REPORTE', 'ANTES', 'DESPUES')`);
        await queryRunner.query(`CREATE TABLE "ot_fotos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orden_id" uuid NOT NULL, "momento" "public"."momento_foto" NOT NULL, "archivo" character varying(255) NOT NULL, "mime" character varying(100) NOT NULL, "tamano_bytes" integer NOT NULL, "subido_por_id" uuid, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_60e22266d05b85b25f27fe72dad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "FK_bc546d35078725304243296e99a" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "FK_f9adb51024f61e1819c4b4a8db1" FOREIGN KEY ("tecnico_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "plan_repuestos" ADD CONSTRAINT "FK_dbce3193ae575d18e3a1860106c" FOREIGN KEY ("plan_id") REFERENCES "planes_mantenimiento"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "plan_repuestos" ADD CONSTRAINT "FK_68c54975c0e395785bd5a831591" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "FK_67ea0e95fe4e3235a07f3efcce2" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "FK_26b765af71e7db1c106bfd4d3ad" FOREIGN KEY ("plan_id") REFERENCES "planes_mantenimiento"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "FK_cf5c3f64998eedf745d9c12f8e9" FOREIGN KEY ("reportado_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "FK_7b6926c10f2f925dc81f9de532c" FOREIGN KEY ("asignado_a_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "FK_4f7f8cd5bac9593e6b89517dccf" FOREIGN KEY ("cerrada_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_repuestos" ADD CONSTRAINT "FK_18f30b20d910b982f2fc7173557" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_repuestos" ADD CONSTRAINT "FK_5862f4386bc266b9f6d294112cf" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_mano_obra" ADD CONSTRAINT "FK_d8dcc95b5fd06c49f0f4bb0c343" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_mano_obra" ADD CONSTRAINT "FK_2b85c10a4c649e1eaad6ee62226" FOREIGN KEY ("tecnico_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_eventos" ADD CONSTRAINT "FK_d1afab9b15a8eb82110eb3a0301" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_eventos" ADD CONSTRAINT "FK_4c7a7d220d36f50c5e5d7551fc4" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_fotos" ADD CONSTRAINT "FK_a6382b23ec0684f65713dcb1d83" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ot_fotos" ADD CONSTRAINT "FK_483bf45c56c885f42b61d88973a" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        // El historial de estados de la OT es de solo inserción (MNT-03)
        await queryRunner.query(`CREATE TRIGGER trg_ot_eventos_inmutable BEFORE UPDATE OR DELETE ON "ot_eventos" FOR EACH ROW EXECUTE FUNCTION fn_registro_inmutable()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_ot_eventos_inmutable ON "ot_eventos"`);
        await queryRunner.query(`ALTER TABLE "ot_fotos" DROP CONSTRAINT "FK_483bf45c56c885f42b61d88973a"`);
        await queryRunner.query(`ALTER TABLE "ot_fotos" DROP CONSTRAINT "FK_a6382b23ec0684f65713dcb1d83"`);
        await queryRunner.query(`ALTER TABLE "ot_eventos" DROP CONSTRAINT "FK_4c7a7d220d36f50c5e5d7551fc4"`);
        await queryRunner.query(`ALTER TABLE "ot_eventos" DROP CONSTRAINT "FK_d1afab9b15a8eb82110eb3a0301"`);
        await queryRunner.query(`ALTER TABLE "ot_mano_obra" DROP CONSTRAINT "FK_2b85c10a4c649e1eaad6ee62226"`);
        await queryRunner.query(`ALTER TABLE "ot_mano_obra" DROP CONSTRAINT "FK_d8dcc95b5fd06c49f0f4bb0c343"`);
        await queryRunner.query(`ALTER TABLE "ot_repuestos" DROP CONSTRAINT "FK_5862f4386bc266b9f6d294112cf"`);
        await queryRunner.query(`ALTER TABLE "ot_repuestos" DROP CONSTRAINT "FK_18f30b20d910b982f2fc7173557"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "FK_4f7f8cd5bac9593e6b89517dccf"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "FK_7b6926c10f2f925dc81f9de532c"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "FK_cf5c3f64998eedf745d9c12f8e9"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "FK_26b765af71e7db1c106bfd4d3ad"`);
        await queryRunner.query(`ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "FK_67ea0e95fe4e3235a07f3efcce2"`);
        await queryRunner.query(`ALTER TABLE "plan_repuestos" DROP CONSTRAINT "FK_68c54975c0e395785bd5a831591"`);
        await queryRunner.query(`ALTER TABLE "plan_repuestos" DROP CONSTRAINT "FK_dbce3193ae575d18e3a1860106c"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "FK_f9adb51024f61e1819c4b4a8db1"`);
        await queryRunner.query(`ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "FK_bc546d35078725304243296e99a"`);
        await queryRunner.query(`DROP TABLE "ot_fotos"`);
        await queryRunner.query(`DROP TYPE "public"."momento_foto"`);
        await queryRunner.query(`DROP TABLE "ot_eventos"`);
        await queryRunner.query(`DROP TABLE "ot_mano_obra"`);
        await queryRunner.query(`DROP TABLE "ot_repuestos"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3f90901dc8f642b11bff8a8d2f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3e39d2d06f8f3809279d3e8049"`);
        await queryRunner.query(`DROP TABLE "ordenes_trabajo"`);
        await queryRunner.query(`DROP TYPE "public"."prioridad_orden"`);
        await queryRunner.query(`DROP TYPE "public"."estado_orden"`);
        await queryRunner.query(`DROP TYPE "public"."tipo_orden"`);
        await queryRunner.query(`DROP TABLE "plan_repuestos"`);
        await queryRunner.query(`DROP TABLE "planes_mantenimiento"`);
        await queryRunner.query(`DROP TYPE "public"."unidad_frecuencia"`);
    }

}
