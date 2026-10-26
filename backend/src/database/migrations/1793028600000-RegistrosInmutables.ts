import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La bitácora (SEG-05) y los movimientos de inventario (INV-03) son registros de solo inserción.
 * Este trigger rechaza UPDATE y DELETE incluso si alguien lo intenta directamente en la base de datos.
 */
export class RegistrosInmutables1793028600000 implements MigrationInterface {
  name = 'RegistrosInmutables1793028600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION fn_registro_inmutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'La tabla % es de solo inserción: no se permite %', TG_TABLE_NAME, TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);
    for (const t of ['bitacora', 'movimientos_inventario']) {
      await q.query(`
        CREATE TRIGGER trg_${t}_inmutable BEFORE UPDATE OR DELETE ON "${t}"
        FOR EACH ROW EXECUTE FUNCTION fn_registro_inmutable();
      `);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['bitacora', 'movimientos_inventario']) {
      await q.query(`DROP TRIGGER IF EXISTS trg_${t}_inmutable ON "${t}"`);
    }
    await q.query(`DROP FUNCTION IF EXISTS fn_registro_inmutable()`);
  }
}
