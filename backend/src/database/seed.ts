/**
 * Datos iniciales.
 *   npm run seed            → crea solo el usuario administrador inicial (si no hay usuarios).
 *   npm run seed -- --demo  → además crea usuarios, máquinas y repuestos de demostración.
 *                             NO usar --demo en producción.
 *
 * La contraseña del administrador se toma de SEED_ADMIN_PASSWORD; si no existe,
 * se genera una aleatoria y se muestra una sola vez en consola.
 */
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { EstadoActivo, Rol, TipoMovimiento } from '../common/enums';
import { InventoryMovement } from '../inventory/inventory-movement.entity';
import { SparePart } from '../inventory/spare-part.entity';
import { PARAM_AUTORIZADOR_COMPRAS, Setting } from '../settings/setting.entity';
import { hashCredencial } from '../users/credentials';
import { User } from '../users/user.entity';
import dataSource from './data-source';

async function crearUsuario(ds: DataSource, nombre: string, usuario: string, rol: Rol, credencial: string) {
  const r = ds.getRepository(User);
  const existente = await r.findOne({ where: { usuario } });
  if (existente) return existente;
  return r.save(r.create({ nombre, usuario, rol, ...(await hashCredencial(rol, credencial)) }));
}

async function main() {
  const demo = process.argv.includes('--demo');
  const ds = await dataSource.initialize();

  if ((await ds.getRepository(User).count()) === 0) {
    const pass = process.env.SEED_ADMIN_PASSWORD ?? `Cmms${randomBytes(6).toString('hex')}9`;
    await crearUsuario(ds, 'Administrador', 'admin', Rol.ADMIN, pass);
    console.log('Usuario administrador creado: admin');
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`Contraseña generada (cámbiela al ingresar): ${pass}`);
  } else {
    console.log('Ya existen usuarios; no se crea el administrador inicial.');
  }

  if (demo) {
    const admin = await ds.getRepository(User).findOneOrFail({ where: { usuario: 'admin' } });
    const autorizador = await crearUsuario(ds, 'Autorizador Demo', 'autorizador', Rol.AUTORIZADOR, 'Autoriza2026');
    await crearUsuario(ds, 'Técnico Demo', 'tecnico', Rol.TECNICO, '4826');
    await crearUsuario(ds, 'Operario Demo', 'operario', Rol.OPERARIO, '7391');
    await ds.getRepository(Setting).save({ clave: PARAM_AUTORIZADOR_COMPRAS, valor: autorizador.id });

    const activos: Partial<Asset>[] = [
      { codigo: 'MOL-001', nombre: 'Molino de carne', modelo: 'M-32', fabricante: 'Javar', area: 'Proceso', ubicacion: 'Sala de molienda', fechaCompra: '2021-03-15', fechaFinGarantia: '2023-03-15' },
      { codigo: 'EMB-002', nombre: 'Embutidora al vacío', modelo: 'VF-608', fabricante: 'Handtmann', area: 'Proceso', ubicacion: 'Sala de embutido', fechaCompra: '2022-07-01', fechaFinGarantia: '2027-07-01' },
      { codigo: 'CF-001', nombre: 'Cuarto frío de producto terminado', fabricante: 'Frigotec', area: 'Refrigeración', ubicacion: 'Bodega PT', fechaCompra: '2019-11-20' },
      { codigo: 'HRN-001', nombre: 'Horno de cocción', modelo: 'HC-500', fabricante: 'Fessmann', area: 'Cocción', ubicacion: 'Sala de hornos', estado: EstadoActivo.EN_MANTENIMIENTO },
    ];
    for (const a of activos) {
      if (!(await ds.getRepository(Asset).exists({ where: { codigo: a.codigo } }))) await ds.getRepository(Asset).save(a);
    }

    const repuestos: Array<Partial<SparePart> & { inicial: number; costo: number }> = [
      { codigo: 'RP-CUCH-32', descripcion: 'Cuchilla para molino M-32', unidad: 'UND', ubicacion: 'Estante A1', stockMinimo: 2, inicial: 4, costo: 185000 },
      { codigo: 'RP-PLACA-8', descripcion: 'Placa perforada 8 mm', unidad: 'UND', ubicacion: 'Estante A1', stockMinimo: 1, inicial: 2, costo: 240000 },
      { codigo: 'RP-ROD-6205', descripcion: 'Rodamiento 6205-2RS', unidad: 'UND', ubicacion: 'Estante B3', stockMinimo: 6, inicial: 3, costo: 18500 },
      { codigo: 'RP-ACE-GA', descripcion: 'Aceite grado alimenticio H1', unidad: 'L', ubicacion: 'Bodega lubricantes', stockMinimo: 10, inicial: 20, costo: 42000 },
    ];
    for (const { inicial, costo, ...r } of repuestos) {
      if (await ds.getRepository(SparePart).exists({ where: { codigo: r.codigo } })) continue;
      const saved = await ds.getRepository(SparePart).save({ ...r, costoPromedio: costo });
      await ds.getRepository(InventoryMovement).save({
        repuestoId: saved.id, tipo: TipoMovimiento.ENTRADA_AJUSTE, cantidad: inicial, costoUnitario: costo,
        motivo: 'Inventario inicial (datos de demostración)', usuarioId: admin.id,
      });
    }
    console.log('Datos de demostración cargados. Usuarios: autorizador / Autoriza2026, tecnico / PIN 4826, operario / PIN 7391');
  }

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
