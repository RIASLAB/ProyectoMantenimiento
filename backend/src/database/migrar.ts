/**
 * Aplica las migraciones pendientes con el código compilado (producción, sin herramientas de desarrollo):
 *   node dist/database/migrar.js
 * El contenedor de producción lo ejecuta al arrancar, antes de iniciar la API.
 */
import dataSource from './data-source';

async function main() {
  await dataSource.initialize();
  try {
    const hechas = await dataSource.runMigrations({ transaction: 'each' });
    console.log(hechas.length ? `Migraciones aplicadas: ${hechas.map((m) => m.name).join(', ')}` : 'Base de datos al día: no hay migraciones pendientes');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((e) => {
  console.error('No se pudieron aplicar las migraciones:', e instanceof Error ? e.message : e);
  process.exit(1);
});
