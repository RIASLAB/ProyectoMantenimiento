/**
 * Administrador principal (D-41), desde el servidor:
 *   docker exec -it cmms-app-1 node dist/database/administrador-principal.js            → muestra quién es
 *   docker exec -it cmms-app-1 node dist/database/administrador-principal.js jhon       → marca a "jhon" como principal
 *   docker exec -it cmms-app-1 node dist/database/administrador-principal.js jhon --quitar
 * Solo un administrador puede ser principal. No se puede quitar el último principal. Queda en la bitácora.
 */
import { AuditLog } from '../audit/audit-log.entity';
import { Rol } from '../common/enums';
import { User } from '../users/user.entity';
import dataSource from './data-source';

async function main() {
  const usuario = (process.argv[2] ?? '').trim().toLowerCase();
  const quitar = process.argv.includes('--quitar');
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    const principales = () => repo.find({ where: { principal: true }, order: { usuario: 'ASC' } });
    const mostrar = async () => {
      const p = await principales();
      console.log(p.length ? `Administrador principal: ${p.map((u) => `${u.usuario} (${u.nombre})`).join(', ')}` : 'No hay administrador principal.');
    };
    if (!usuario) return void (await mostrar());

    const u = await repo.createQueryBuilder('u').where('lower(u.usuario) = :u', { u: usuario }).getOne();
    if (!u) {
      const admins = await repo.find({ where: { rol: Rol.ADMIN }, order: { usuario: 'ASC' } });
      console.error(`No existe el usuario "${usuario}". Administradores: ${admins.map((x) => x.usuario).join(', ')}`);
      process.exit(1);
    }
    if (!quitar && u.rol !== Rol.ADMIN) {
      console.error(`"${u.usuario}" no es Administrador: primero cámbiele el rol en la app.`);
      process.exit(1);
    }
    if (quitar && u.principal && (await principales()).length === 1) {
      console.error('Es el único administrador principal: marque a otro antes de quitarlo.');
      process.exit(1);
    }
    if (u.principal !== !quitar) {
      await dataSource.transaction(async (em) => {
        await em.getRepository(User).update(u.id, { principal: !quitar });
        await em.getRepository(AuditLog).insert({
          usuarioId: null, accion: quitar ? 'PRINCIPAL_QUITADO' : 'PRINCIPAL_ASIGNADO', entidad: 'usuario', entidadId: u.id,
          detalle: { usuario: u.usuario, origen: 'servidor' },
        });
      });
    }
    await mostrar();
  } finally {
    await dataSource.destroy();
  }
}

main().catch((e) => {
  console.error('No se pudo cambiar el administrador principal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
