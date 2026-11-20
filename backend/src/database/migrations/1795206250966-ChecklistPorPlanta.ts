import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-44: cada registro de checklist guarda la planta donde se llenó, porque el mismo formato (p. ej. el de la
 * empacadora) se usa en varias plantas y cada una lleva el suyo. Los registros anteriores toman la planta solo
 * cuando se sabe con certeza: la única planta del formato o, si es de varias, la planta del área de la máquina.
 * La tabla es de solo inserción: se suspende su protección únicamente para llenar esta columna nueva.
 */
export class ChecklistPorPlanta1795206250966 implements MigrationInterface {
  name = 'ChecklistPorPlanta1795206250966';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "registros_checklist" ADD "planta" character varying(60)`);
    await q.query(`ALTER TABLE registros_checklist DISABLE TRIGGER trg_registros_checklist_inmutable`);
    await q.query(`
      UPDATE registros_checklist c SET planta = p.plantas[1]
        FROM plantillas_checklist p
       WHERE p.id = c.plantilla_id AND cardinality(p.plantas) = 1`);
    await q.query(`
      UPDATE registros_checklist c SET planta = pl.planta
        FROM plantillas_checklist p, activos a, LATERAL unnest(p.plantas) AS pl(planta)
       WHERE p.id = c.plantilla_id AND a.id = c.activo_id AND c.planta IS NULL AND cardinality(p.plantas) > 1
         AND a.area ILIKE '%' || btrim(regexp_replace(pl.planta, '^planta', '', 'i')) || '%'`);
    await q.query(`ALTER TABLE registros_checklist ENABLE TRIGGER trg_registros_checklist_inmutable`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "registros_checklist" DROP COLUMN "planta"`);
  }
}
