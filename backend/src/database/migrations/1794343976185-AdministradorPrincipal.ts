import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-41: administrador principal (el dueño del sistema). Queda marcado el administrador inicial ("admin", el que
 * crea la instalación) o, si no existe, el administrador más antiguo. Se cambia desde el servidor con
 * database/administrador-principal.js.
 */
export class AdministradorPrincipal1794343976185 implements MigrationInterface {
  name = 'AdministradorPrincipal1794343976185';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "usuarios" ADD "administrador_principal" boolean NOT NULL DEFAULT false`);
    await q.query(`
      UPDATE usuarios SET administrador_principal = true WHERE id = (
        SELECT id FROM usuarios WHERE rol = 'ADMIN'
        ORDER BY (usuario = 'admin') DESC, activo DESC, creado_en ASC LIMIT 1
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "usuarios" DROP COLUMN "administrador_principal"`);
  }
}
