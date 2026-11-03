/**
 * Carga los formatos de mantenimiento de la planta (preoperacionales, hojas diarias, tableros eléctricos,
 * cuartos fríos con sus puntos de temperatura e iluminación).
 *   npm run formatos:cargar            (desarrollo)
 *   node dist/database/cargar-formatos.js   (producción)
 * Se puede correr varias veces: no duplica ni modifica lo que ya existe.
 */
import { User } from '../users/user.entity';
import { Rol } from '../common/enums';
import dataSource from './data-source';
import { cargarFormatos } from './formatos/cargar';

async function main() {
  const ds = await dataSource.initialize();
  const admin = await ds.getRepository(User).findOne({ where: { rol: Rol.ADMIN }, order: { creadoEn: 'ASC' } });
  const r = await cargarFormatos(ds, admin?.id ?? null);
  console.log(
    `Formatos cargados: ${r.plantillas} plantillas de checklist, ${r.instalaciones} cuartos fríos (${r.puntosTemperatura} puntos de temperatura), ` +
      `${r.recintos} tipos de recinto y ${r.puntosIluminacion} puntos de iluminación. Lo que ya existía no se modificó.`,
  );
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
