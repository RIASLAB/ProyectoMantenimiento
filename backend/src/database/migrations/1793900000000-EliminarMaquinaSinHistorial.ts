import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-35: al eliminar una máquina sin historial se borran sus órdenes abiertas sin trabajo con su historial de
 * eventos. Ese historial es de solo inserción; se permite borrarlo únicamente dentro de esa operación
 * (variable de la transacción "cmms.borrar_maquina_sin_historial"). Las demás tablas siguen intocables.
 */
export class EliminarMaquinaSinHistorial1793900000000 implements MigrationInterface {
  name = 'EliminarMaquinaSinHistorial1793900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION fn_registro_inmutable() RETURNS trigger AS $$
      BEGIN
        IF TG_TABLE_NAME = 'ot_eventos' AND TG_OP = 'DELETE'
           AND current_setting('cmms.borrar_maquina_sin_historial', true) = 'on' THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'La tabla % es de solo inserción: no se permite %', TG_TABLE_NAME, TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION fn_registro_inmutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'La tabla % es de solo inserción: no se permite %', TG_TABLE_NAME, TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
