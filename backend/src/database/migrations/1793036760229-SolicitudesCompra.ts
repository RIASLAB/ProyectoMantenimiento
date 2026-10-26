import { MigrationInterface, QueryRunner } from "typeorm";

export class SolicitudesCompra1793036760229 implements MigrationInterface {
    name = 'SolicitudesCompra1793036760229'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."estado_compra" AS ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA', 'COMPRADA', 'RECIBIDA', 'CANCELADA')`);
        await queryRunner.query(`CREATE TYPE "public"."origen_compra" AS ENUM('AUTOMATICA', 'MANUAL')`);
        await queryRunner.query(`CREATE TABLE "solicitudes_compra" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "numero" SERIAL NOT NULL, "estado" "public"."estado_compra" NOT NULL DEFAULT 'PENDIENTE', "origen" "public"."origen_compra" NOT NULL, "repuesto_id" uuid NOT NULL, "cantidad" numeric(14,3) NOT NULL, "orden_id" uuid, "justificacion" text NOT NULL, "solicitado_por_id" uuid, "decidida_por_id" uuid, "decidida_en" TIMESTAMP WITH TIME ZONE, "motivo_rechazo" character varying(500), "proveedor" character varying(150), "numero_orden_compra" character varying(60), "costo_estimado" numeric(14,2), "comprada_en" TIMESTAMP WITH TIME ZONE, "cantidad_recibida" numeric(14,3), "costo_unitario" numeric(14,2), "factura" character varying(60), "recibida_en" TIMESTAMP WITH TIME ZONE, "recibida_por_id" uuid, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c1af0c255d6625fb2764ede7739" UNIQUE ("numero"), CONSTRAINT "PK_6ca8505ed144a7e98a345065b6b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a941c03dc0e6caf2a564f639ed" ON "solicitudes_compra" ("orden_id", "repuesto_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_2a6d21174623e28351d768615a" ON "solicitudes_compra" ("estado") `);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "FK_11702188489d7ef22be793a5eb6" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "FK_2b4806bcb011c84703b637a0d3a" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "FK_622a1ec5796964a075ee227de01" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "FK_30d1807adcb2dd7af027a1dda66" FOREIGN KEY ("decidida_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "FK_395c5f0f4c57bd28b164f87915c" FOREIGN KEY ("recibida_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" DROP CONSTRAINT "FK_395c5f0f4c57bd28b164f87915c"`);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" DROP CONSTRAINT "FK_30d1807adcb2dd7af027a1dda66"`);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" DROP CONSTRAINT "FK_622a1ec5796964a075ee227de01"`);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" DROP CONSTRAINT "FK_2b4806bcb011c84703b637a0d3a"`);
        await queryRunner.query(`ALTER TABLE "solicitudes_compra" DROP CONSTRAINT "FK_11702188489d7ef22be793a5eb6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2a6d21174623e28351d768615a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a941c03dc0e6caf2a564f639ed"`);
        await queryRunner.query(`DROP TABLE "solicitudes_compra"`);
        await queryRunner.query(`DROP TYPE "public"."origen_compra"`);
        await queryRunner.query(`DROP TYPE "public"."estado_compra"`);
    }

}
