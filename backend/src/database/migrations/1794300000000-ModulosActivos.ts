import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-40: la planta arranca sin los módulos de Inventario y Compras. Si la base no tiene la preferencia todavía,
 * queda guardada apagada; el administrador los enciende en Ajustes → Módulos cuando los vayan a usar.
 */
export class ModulosActivos1794300000000 implements MigrationInterface {
  name = 'ModulosActivos1794300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`INSERT INTO parametros (clave, valor) VALUES ('modulos_activos', '{"inventario":false,"compras":false}') ON CONFLICT (clave) DO NOTHING`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM parametros WHERE clave = 'modulos_activos'`);
  }
}
