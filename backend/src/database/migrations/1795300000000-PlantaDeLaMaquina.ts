import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-45: cada máquina puede tener su planta, para que al llenar un checklist de una planta solo salgan sus máquinas.
 * Las máquinas existentes toman la planta solo si su área o ubicación la nombra sin duda (p. ej. los cuartos fríos
 * cargados de los formatos, con área "Planta Desposte"); las demás quedan sin asignar y el administrador la pone.
 */
export class PlantaDeLaMaquina1795300000000 implements MigrationInterface {
  name = 'PlantaDeLaMaquina1795300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "activos" ADD "planta" character varying(60)`);
    for (const [planta, palabra] of [['Planta Pollo', 'pollo'], ['Planta Desposte', 'desposte'], ['Planta Salsamentaria', 'salsamentaria']]) {
      await q.query(
        `UPDATE activos SET planta = $1
          WHERE planta IS NULL
            AND (area || ' ' || coalesce(ubicacion, '')) ILIKE '%' || $2 || '%'
            AND (SELECT count(*) FROM unnest(ARRAY['pollo', 'desposte', 'salsamentaria']) w
                  WHERE (area || ' ' || coalesce(ubicacion, '')) ILIKE '%' || w || '%') = 1`,
        [planta, palabra],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "activos" DROP COLUMN "planta"`);
  }
}
