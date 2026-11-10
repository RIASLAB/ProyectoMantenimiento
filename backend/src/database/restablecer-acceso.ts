/**
 * Restablece el acceso de un usuario desde el servidor, cuando nadie puede entrar a la app (D-38):
 *   docker exec -it cmms-app-1 node dist/database/restablecer-acceso.js admin
 * Genera una contraseña (o PIN) temporal, quita el bloqueo por intentos fallidos y obliga a cambiarla
 * al ingresar. La temporal se muestra solo en la pantalla del servidor; queda constancia en la bitácora.
 * Solo lo puede correr quien tiene acceso al servidor.
 */
import { randomBytes, randomInt } from 'crypto';
import { AuditLog } from '../audit/audit-log.entity';
import { hashCredencial, usaPin } from '../users/credentials';
import { User } from '../users/user.entity';
import dataSource from './data-source';

async function main() {
  const usuario = (process.argv[2] ?? '').trim().toLowerCase();
  if (!usuario) {
    console.error('Indique el usuario. Ejemplo: node dist/database/restablecer-acceso.js admin');
    process.exit(2);
  }
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    const u = await repo.createQueryBuilder('u').where('lower(u.usuario) = :u', { u: usuario }).getOne();
    if (!u) {
      const lista = await repo.find({ order: { usuario: 'ASC' } });
      console.error(`No existe el usuario "${usuario}". Usuarios: ${lista.map((x) => `${x.usuario} (${x.rol}${x.activo ? '' : ', inactivo'})`).join(', ')}`);
      process.exit(1);
    }
    let temporal: string;
    do {
      temporal = usaPin(u.rol) ? String(randomInt(100000, 1000000)) : `Temp${randomBytes(4).toString('hex')}${randomInt(10, 100)}`;
    } while (usaPin(u.rol) && /^(\d)\1+$/.test(temporal));
    await dataSource.transaction(async (em) => {
      await em.getRepository(User).update(u.id, { ...(await hashCredencial(u.rol, temporal)), intentosFallidos: 0, bloqueadoHasta: null, debeCambiarCredencial: true, activo: true });
      await em.getRepository(AuditLog).insert({ usuarioId: null, accion: 'ACCESO_RESTABLECIDO', entidad: 'usuario', entidadId: u.id, detalle: { usuario: u.usuario, origen: 'servidor' } });
    });
    console.log(`Acceso restablecido para "${u.usuario}" (${u.nombre}).`);
    console.log(`${usaPin(u.rol) ? 'PIN' : 'Contraseña'} temporal: ${temporal}`);
    console.log('Al ingresar, el sistema pedirá cambiarla.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((e) => {
  console.error('No se pudo restablecer el acceso:', e instanceof Error ? e.message : e);
  process.exit(1);
});
