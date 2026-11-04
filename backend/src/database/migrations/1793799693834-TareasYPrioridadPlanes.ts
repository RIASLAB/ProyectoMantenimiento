import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-31: catálogo de tareas de mantenimiento que se eligen al armar un preventivo, y prioridad del plan
 * en lugar del técnico (el jefe asigna cada orden). El texto de "tareas" que ya tenían los planes se conserva
 * como indicaciones adicionales.
 */
export class TareasYPrioridadPlanes1793799693834 implements MigrationInterface {
  name = 'TareasYPrioridadPlanes1793799693834';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "tareas_mantenimiento" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nombre" character varying(150) NOT NULL, "grupo" character varying(60), "descripcion" text, "activa" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ed8f2348aecd4a1906ddb83b978" PRIMARY KEY ("id"))`);
    await q.query(`CREATE UNIQUE INDEX "UQ_tarea_nombre" ON "tareas_mantenimiento" (lower("nombre"))`);
    await q.query(`CREATE TABLE "plan_tareas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "plan_id" uuid NOT NULL, "tarea_id" uuid NOT NULL, "orden" integer NOT NULL, CONSTRAINT "PK_57a349ad89f84e72b0325377a41" PRIMARY KEY ("id"))`);
    await q.query(`CREATE UNIQUE INDEX "IDX_4950b399ecf49d6949557ddc99" ON "plan_tareas" ("plan_id", "tarea_id") `);
    await q.query(`ALTER TABLE "plan_tareas" ADD CONSTRAINT "FK_6a44006df57aa88d26526b6f00d" FOREIGN KEY ("plan_id") REFERENCES "planes_mantenimiento"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await q.query(`ALTER TABLE "plan_tareas" ADD CONSTRAINT "FK_b4a2906e8662bbd5e8e6420badb" FOREIGN KEY ("tarea_id") REFERENCES "tareas_mantenimiento"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await q.query(`ALTER TABLE "planes_mantenimiento" ADD "prioridad" "public"."prioridad_orden" NOT NULL DEFAULT 'MEDIA'`);
    await q.query(`ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "FK_f9adb51024f61e1819c4b4a8db1"`);
    await q.query(`ALTER TABLE "planes_mantenimiento" DROP COLUMN "tecnico_id"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "planes_mantenimiento" ADD "tecnico_id" uuid`);
    await q.query(`ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "FK_f9adb51024f61e1819c4b4a8db1" FOREIGN KEY ("tecnico_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await q.query(`ALTER TABLE "planes_mantenimiento" DROP COLUMN "prioridad"`);
    await q.query(`DROP TABLE "plan_tareas"`);
    await q.query(`DROP TABLE "tareas_mantenimiento"`);
  }
}
