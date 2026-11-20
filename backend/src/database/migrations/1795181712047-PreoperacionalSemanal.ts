import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-43: el preoperacional por máquina se llena una vez por semana por equipo. Quedan semanales los preoperacionales
 * cargados de los formatos ("Preoperacional …"); las hojas diarias ("Preoperatorio diario …"), el aseo y los
 * tableros siguen sin límite. El administrador lo cambia en cada plantilla.
 */
export class PreoperacionalSemanal1795181712047 implements MigrationInterface {
  name = 'PreoperacionalSemanal1795181712047';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "plantillas_checklist" ADD "semanal" boolean NOT NULL DEFAULT false`);
    await q.query(`UPDATE plantillas_checklist SET semanal = true WHERE nombre ILIKE 'Preoperacional %'`);
    // Para buscar rápido lo llenado en la semana por plantilla y equipo.
    await q.query(`CREATE INDEX "IDX_registros_checklist_plantilla_fecha" ON "registros_checklist" ("plantilla_id", "registrado_en")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "public"."IDX_registros_checklist_plantilla_fecha"`);
    await q.query(`ALTER TABLE "plantillas_checklist" DROP COLUMN "semanal"`);
  }
}
