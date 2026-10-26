import { MigrationInterface, QueryRunner } from "typeorm";

export class Inicial1793028589166 implements MigrationInterface {
    name = 'Inicial1793028589166'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."rol_usuario" AS ENUM('ADMIN', 'AUTORIZADOR', 'TECNICO', 'OPERARIO')`);
        await queryRunner.query(`CREATE TABLE "usuarios" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nombre" character varying(120) NOT NULL, "usuario" character varying(60) NOT NULL, "email" character varying(160), "rol" "public"."rol_usuario" NOT NULL, "password_hash" character varying, "pin_hash" character varying, "activo" boolean NOT NULL DEFAULT true, "intentos_fallidos" integer NOT NULL DEFAULT '0', "bloqueado_hasta" TIMESTAMP WITH TIME ZONE, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_0790a401b9d234fa921e9aa1777" UNIQUE ("usuario"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."estado_activo" AS ENUM('OPERATIVO', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'DADO_DE_BAJA')`);
        await queryRunner.query(`CREATE TABLE "activos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "codigo" character varying(40) NOT NULL, "codigo_sap" character varying(40), "nombre" character varying(150) NOT NULL, "modelo" character varying(100), "fabricante" character varying(100), "serie" character varying(100), "area" character varying(100) NOT NULL, "ubicacion" character varying(150), "fecha_compra" date, "fecha_fin_garantia" date, "estado" "public"."estado_activo" NOT NULL DEFAULT 'OPERATIVO', "notas" text, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_de6ddb2243d5afcd952f55e04a7" UNIQUE ("codigo"), CONSTRAINT "PK_6a8f8eb920ce79c617c5a10e2d9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "activo_documentos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "activo_id" uuid NOT NULL, "nombre_original" character varying(255) NOT NULL, "archivo" character varying(255) NOT NULL, "mime" character varying(100) NOT NULL, "tamano_bytes" integer NOT NULL, "subido_por_id" uuid, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_51e10861a3288d6975d0fdac8a0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bitacora" ("id" BIGSERIAL NOT NULL, "usuario_id" uuid, "accion" character varying(80) NOT NULL, "entidad" character varying(60) NOT NULL, "entidad_id" character varying(60), "detalle" jsonb, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e08eb7c81388757d9e53d62246e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c2e65e1e6a8a1c0eefda7627c2" ON "bitacora" ("entidad", "entidad_id") `);
        await queryRunner.query(`CREATE TABLE "repuestos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "codigo" character varying(40) NOT NULL, "codigo_sap" character varying(40), "descripcion" character varying(200) NOT NULL, "unidad" character varying(20) NOT NULL, "ubicacion" character varying(100), "stock_minimo" numeric(14,3) NOT NULL DEFAULT '0', "costo_promedio" numeric(14,2) NOT NULL DEFAULT '0', "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d4f9476901272fdebaa966884a6" UNIQUE ("codigo"), CONSTRAINT "PK_1f5876d5f0a6dd52f58c191581f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tipo_movimiento" AS ENUM('ENTRADA_COMPRA', 'ENTRADA_AJUSTE', 'ENTRADA_DEVOLUCION', 'SALIDA_CONSUMO', 'SALIDA_AJUSTE')`);
        await queryRunner.query(`CREATE TABLE "movimientos_inventario" ("id" BIGSERIAL NOT NULL, "repuesto_id" uuid NOT NULL, "tipo" "public"."tipo_movimiento" NOT NULL, "cantidad" numeric(14,3) NOT NULL, "costo_unitario" numeric(14,2) NOT NULL, "motivo" character varying(300), "referencia" character varying(80), "client_id" uuid, "usuario_id" uuid, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_445f536d4793f1de9fe913eff6a" UNIQUE ("client_id"), CONSTRAINT "PK_812f6e4f95b017981363c4b9ff9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_aba9a727e1e2d673fbe0283e83" ON "movimientos_inventario" ("repuesto_id", "creado_en") `);
        await queryRunner.query(`CREATE TABLE "parametros" ("clave" character varying(80) NOT NULL, "valor" text, "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d52f3fb26992445525eaa8ce435" PRIMARY KEY ("clave"))`);
        await queryRunner.query(`ALTER TABLE "activo_documentos" ADD CONSTRAINT "FK_852404972c0a7b87b77476a81bb" FOREIGN KEY ("activo_id") REFERENCES "activos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activo_documentos" ADD CONSTRAINT "FK_fcbf1a13f3202c1260b0066e88b" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bitacora" ADD CONSTRAINT "FK_06536d0ae56acd2bb24cdcbae86" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "FK_70c542b79172e3f01e53b79bda2" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "FK_c86769588f51c7bbb6bf78ca32b" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "FK_c86769588f51c7bbb6bf78ca32b"`);
        await queryRunner.query(`ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "FK_70c542b79172e3f01e53b79bda2"`);
        await queryRunner.query(`ALTER TABLE "bitacora" DROP CONSTRAINT "FK_06536d0ae56acd2bb24cdcbae86"`);
        await queryRunner.query(`ALTER TABLE "activo_documentos" DROP CONSTRAINT "FK_fcbf1a13f3202c1260b0066e88b"`);
        await queryRunner.query(`ALTER TABLE "activo_documentos" DROP CONSTRAINT "FK_852404972c0a7b87b77476a81bb"`);
        await queryRunner.query(`DROP TABLE "parametros"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aba9a727e1e2d673fbe0283e83"`);
        await queryRunner.query(`DROP TABLE "movimientos_inventario"`);
        await queryRunner.query(`DROP TYPE "public"."tipo_movimiento"`);
        await queryRunner.query(`DROP TABLE "repuestos"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c2e65e1e6a8a1c0eefda7627c2"`);
        await queryRunner.query(`DROP TABLE "bitacora"`);
        await queryRunner.query(`DROP TABLE "activo_documentos"`);
        await queryRunner.query(`DROP TABLE "activos"`);
        await queryRunner.query(`DROP TYPE "public"."estado_activo"`);
        await queryRunner.query(`DROP TABLE "usuarios"`);
        await queryRunner.query(`DROP TYPE "public"."rol_usuario"`);
    }

}
