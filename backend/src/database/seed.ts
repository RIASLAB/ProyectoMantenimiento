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
import { DataSource, In } from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { EquipmentCategory, EquipmentModel, EquipmentModelPart } from '../equipment/equipment.entities';
import { EstadoActivo, EstadoOrden, OrigenCompra, Prioridad, Rol, TipoMovimiento, TipoOrden, UnidadFrecuencia } from '../common/enums';
import { InventoryMovement } from '../inventory/inventory-movement.entity';
import { SparePart } from '../inventory/spare-part.entity';
import { PARAM_AUTORIZADOR_COMPRAS, PARAM_TARIFA_HORA, Setting } from '../settings/setting.entity';
import { PurchaseRequest } from '../purchases/purchase-request.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { ChecklistTemplate, ControlPoint, TemperatureRecord } from '../quality/quality.entities';
import { MaintenancePlan, MaintenanceTask, PlanPart, PlanTask, WorkOrder, WorkOrderEvent, WorkOrderPart } from '../maintenance/maintenance.entities';
import { hashCredencial } from '../users/credentials';
import { User } from '../users/user.entity';
import dataSource from './data-source';
import { Calibration, Instrument } from '../instruments/instrument.entities';
import { cargarFormatos } from './formatos/cargar';

async function crearUsuario(ds: DataSource, nombre: string, usuario: string, rol: Rol, credencial: string, debeCambiarCredencial = false) {
  const r = ds.getRepository(User);
  const existente = await r.findOne({ where: { usuario } });
  if (existente) return existente;
  return r.save(r.create({ nombre, usuario, rol, debeCambiarCredencial, ...(await hashCredencial(rol, credencial)) }));
}

async function main() {
  const demo = process.argv.includes('--demo');
  const ds = await dataSource.initialize();

  if ((await ds.getRepository(User).count()) === 0) {
    const pass = process.env.SEED_ADMIN_PASSWORD ?? `Cmms${randomBytes(6).toString('hex')}9`;
    // Con una contraseña generada, el administrador debe cambiarla al ingresar.
    const admin = await crearUsuario(ds, 'Administrador', 'admin', Rol.ADMIN, pass, !process.env.SEED_ADMIN_PASSWORD);
    // El primer administrador es el principal (D-41).
    await ds.getRepository(User).update(admin.id, { principal: true });
    console.log('Usuario administrador creado: admin');
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`Contraseña generada (cámbiela al ingresar): ${pass}`);
  } else {
    console.log('Ya existen usuarios; no se crea el administrador inicial.');
  }

  if (demo) {
    // Los datos de demostración usan inventario y compras (D-40): se encienden.
    await ds.query(`INSERT INTO parametros (clave, valor) VALUES ('modulos_activos', '{"inventario":true,"compras":true}') ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`);
    const admin = await ds.getRepository(User).findOneOrFail({ where: { usuario: 'admin' } });
    const autorizador = await crearUsuario(ds, 'Autorizador Demo', 'autorizador', Rol.AUTORIZADOR, 'Autoriza2026');
    const tecnico = await crearUsuario(ds, 'Técnico Demo', 'tecnico', Rol.TECNICO, '4826');
    const operario = await crearUsuario(ds, 'Operario Demo', 'operario', Rol.OPERARIO, '7391');
    await ds.getRepository(Setting).save({ clave: PARAM_AUTORIZADOR_COMPRAS, valor: autorizador.id });
    await ds.getRepository(Setting).save({ clave: PARAM_TARIFA_HORA, valor: '25000' });

    const activos: Partial<Asset>[] = [
      { codigo: 'MOL-001', nombre: 'Molino de carne', modelo: 'M-32', fabricante: 'Javar', area: 'Proceso', ubicacion: 'Sala de molienda', fechaCompra: '2021-03-15', fechaFinGarantia: '2023-03-15' },
      { codigo: 'EMB-002', nombre: 'Embutidora al vacío', modelo: 'VF-608', fabricante: 'Handtmann', area: 'Proceso', ubicacion: 'Sala de embutido', fechaCompra: '2022-07-01', fechaFinGarantia: '2027-07-01' },
      { codigo: 'CF-001', nombre: 'Cuarto frío de producto terminado', fabricante: 'Frigotec', area: 'Refrigeración', ubicacion: 'Bodega PT', fechaCompra: '2019-11-20' },
      { codigo: 'HRN-001', nombre: 'Horno de cocción', modelo: 'HC-500', fabricante: 'Fessmann', area: 'Cocción', ubicacion: 'Sala de hornos', estado: EstadoActivo.EN_MANTENIMIENTO },
    ];
    for (const a of activos) {
      if (!(await ds.getRepository(Asset).exists({ where: { codigo: a.codigo } }))) await ds.getRepository(Asset).save(a);
    }
    // Las máquinas de demostración se dan por registradas hace 90 días, para que los indicadores tengan historia.
    await ds.query(`UPDATE activos SET creado_en = now() - interval '90 days' WHERE codigo = ANY($1) AND creado_en > now() - interval '1 day'`, [activos.map((a) => a.codigo)]);

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
    // Tipos de equipo con su lista de materiales; aires acondicionados iguales en dos áreas.
    if ((await ds.getRepository(EquipmentModel).count()) === 0) {
      for (const r of [
        { codigo: 'RP-FIL-MS12', descripcion: 'Filtro de aire mini split 12.000 BTU', unidad: 'UND', ubicacion: 'Estante C2', stockMinimo: 4, inicial: 8, costo: 35000 },
        { codigo: 'RP-GAS-410', descripcion: 'Gas refrigerante R410A', unidad: 'KG', ubicacion: 'Bodega de gases', stockMinimo: 2, inicial: 5, costo: 68000 },
      ]) {
        if (await ds.getRepository(SparePart).exists({ where: { codigo: r.codigo } })) continue;
        const { inicial, costo, ...datos } = r;
        const saved = await ds.getRepository(SparePart).save({ ...datos, costoPromedio: costo });
        await ds.getRepository(InventoryMovement).save({
          repuestoId: saved.id, tipo: TipoMovimiento.ENTRADA_INICIAL, cantidad: inicial, costoUnitario: costo,
          motivo: 'Saldo inicial (datos de demostración)', referencia: 'CARGA-INICIAL', usuarioId: admin.id,
        });
      }
      const rep = async (codigo: string) => (await ds.getRepository(SparePart).findOneByOrFail({ codigo })).id;
      const tipos: Array<{ categoria: string; nombre: string; fabricante: string; referencia: string; materiales: Array<[string, number]>; equipos: string[] }> = [
        { categoria: 'Aire acondicionado', nombre: 'Mini split 12.000 BTU', fabricante: 'Samsung', referencia: 'AR12', materiales: [['RP-FIL-MS12', 2], ['RP-GAS-410', 0.5]], equipos: [] },
        { categoria: 'Molino', nombre: 'Molino Javar M-32', fabricante: 'Javar', referencia: 'M-32', materiales: [['RP-CUCH-32', 1], ['RP-PLACA-8', 1], ['RP-ROD-6205', 2]], equipos: ['MOL-001'] },
        { categoria: 'Embutidora', nombre: 'Embutidora Handtmann VF-608', fabricante: 'Handtmann', referencia: 'VF-608', materiales: [['RP-ROD-6205', 2], ['RP-ACE-GA', 1]], equipos: ['EMB-002'] },
      ];
      for (const t of tipos) {
        const cat = await ds.getRepository(EquipmentCategory).save({ nombre: t.categoria });
        const modelo = await ds.getRepository(EquipmentModel).save({
          categoriaId: cat.id, nombre: t.nombre, fabricante: t.fabricante, referencia: t.referencia,
          materiales: await Promise.all(t.materiales.map(async ([c, cantidad]) => ds.getRepository(EquipmentModelPart).create({ repuestoId: await rep(c), cantidad }))),
        });
        if (t.equipos.length) await ds.getRepository(Asset).update({ codigo: In(t.equipos) }, { modeloId: modelo.id });
        if (t.categoria === 'Molino') {
          // Compraron más molinos de los que instalaron: dos quedan en bodega.
          for (const codigo of ['MOL-002', 'MOL-003']) {
            if (await ds.getRepository(Asset).exists({ where: { codigo } })) continue;
            await ds.getRepository(Asset).save({ codigo, nombre: 'Molino de carne', fabricante: 'Javar', modelo: 'M-32', area: 'Proceso', ubicacion: 'Bodega de equipos', estado: EstadoActivo.EN_BODEGA, fechaCompra: '2025-08-01', modeloId: modelo.id });
          }
        }
        if (t.categoria === 'Aire acondicionado') {
          for (const [codigo, area, ubicacion] of [['AA-001', 'Bodega', 'Bodega de insumos'], ['AA-002', 'Bodega', 'Bodega de insumos'], ['AA-003', 'Bodega', 'Bodega de empaque'], ['AA-004', 'Oficinas', 'Oficina de producción']]) {
            if (await ds.getRepository(Asset).exists({ where: { codigo } })) continue;
            await ds.getRepository(Asset).save({ codigo, nombre: 'Aire acondicionado mini split', fabricante: 'Samsung', modelo: 'AR12', area, ubicacion, fechaCompra: '2024-02-10', modeloId: modelo.id });
          }
          await ds.query(`UPDATE activos SET creado_en = now() - interval '90 days' WHERE codigo LIKE 'AA-00_' AND creado_en > now() - interval '1 day'`);
        }
      }
    }

    // Órdenes de ejemplo: una falla reportada sin asignar y un plan preventivo con su primera OT.
    if ((await ds.getRepository(WorkOrder).count()) === 0) {
      const emb = await ds.getRepository(Asset).findOneByOrFail({ codigo: 'EMB-002' });
      const mol = await ds.getRepository(Asset).findOneByOrFail({ codigo: 'MOL-001' });
      const rod = await ds.getRepository(SparePart).findOneByOrFail({ codigo: 'RP-ROD-6205' });
      const ace = await ds.getRepository(SparePart).findOneByOrFail({ codigo: 'RP-ACE-GA' });
      const falla = await ds.getRepository(WorkOrder).save({
        tipo: TipoOrden.CORRECTIVO, estado: EstadoOrden.ABIERTA, prioridad: Prioridad.MEDIA, activoId: emb.id,
        descripcion: 'Fuga de aceite en la bomba de vacío (datos de demostración)', reportadoPorId: operario.id,
      });
      await ds.getRepository(WorkOrderEvent).insert({ ordenId: falla.id, usuarioId: operario.id, estadoNuevo: EstadoOrden.ABIERTA, nota: 'Falla reportada' });
      // Catálogo de tareas que el jefe elige al armar los preventivos (D-31).
      const catalogo: Array<[string, string, string | null]> = [
        ['Lubricación', 'Lubricar rodamientos', 'Grasa grado alimenticio; limpiar el exceso'],
        ['Lubricación', 'Cambiar aceite del reductor', null],
        ['Mecánico', 'Revisar holguras y ajustar tornillería', null],
        ['Mecánico', 'Revisar el filo y el estado de cuchillas y placas', null],
        ['Mecánico', 'Revisar bandas y poleas (tensión y desgaste)', null],
        ['Eléctrico', 'Reapretar bornes y revisar conexiones eléctricas', 'Con la máquina desenergizada y bloqueada'],
        ['Eléctrico', 'Medir el consumo del motor (amperaje)', 'Comparar con la placa del motor'],
        ['Refrigeración', 'Limpiar filtros', null],
        ['Refrigeración', 'Limpiar el serpentín del condensador', null],
        ['Refrigeración', 'Revisar la presión del gas refrigerante', null],
        ['Limpieza', 'Limpieza y desinfección general del equipo', null],
      ];
      const tareas = await ds.getRepository(MaintenanceTask).save(catalogo.map(([grupo, nombre, descripcion]) => ({ grupo, nombre, descripcion })));
      const tarea = (n: string) => tareas.find((t) => t.nombre === n)!.id;
      const plan = await ds.getRepository(MaintenancePlan).save({
        activoId: mol.id, nombre: 'Lubricación y revisión de rodamientos', prioridad: Prioridad.MEDIA,
        frecuenciaValor: 1, frecuenciaUnidad: UnidadFrecuencia.MESES, diasAviso: 7,
      });
      await ds.getRepository(PlanTask).save(['Lubricar rodamientos', 'Revisar holguras y ajustar tornillería'].map((n, orden) => ({ planId: plan.id, tareaId: tarea(n), orden })));
      await ds.getRepository(PlanPart).save([{ planId: plan.id, repuestoId: ace.id, cantidad: 1 }, { planId: plan.id, repuestoId: rod.id, cantidad: 2 }]);
      const fecha = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const prev = await ds.getRepository(WorkOrder).save({
        tipo: TipoOrden.PREVENTIVO, estado: EstadoOrden.ASIGNADA, prioridad: Prioridad.MEDIA, activoId: mol.id, planId: plan.id,
        descripcion: `${plan.nombre}\nTareas:\n1. Lubricar rodamientos — Grasa grado alimenticio; limpiar el exceso\n2. Revisar holguras y ajustar tornillería`, fechaProgramada: fecha, asignadoAId: tecnico.id, reportadoPorId: admin.id,
      });
      await ds.getRepository(WorkOrderPart).save([
        { ordenId: prev.id, repuestoId: ace.id, cantidadPlanificada: 1 },
        { ordenId: prev.id, repuestoId: rod.id, cantidadPlanificada: 2 },
      ]);
      await ds.getRepository(WorkOrderEvent).insert({ ordenId: prev.id, usuarioId: admin.id, estadoNuevo: EstadoOrden.ASIGNADA, nota: `Preventivo programado para ${fecha}` });
    }

    // Una solicitud de compra pendiente para que el autorizador tenga algo que revisar.
    if ((await ds.getRepository(PurchaseRequest).count()) === 0) {
      const rod = await ds.getRepository(SparePart).findOneByOrFail({ codigo: 'RP-ROD-6205' });
      const sc = await ds.getRepository(PurchaseRequest).save({
        origen: OrigenCompra.MANUAL, repuestoId: rod.id, cantidad: 6,
        justificacion: 'Reponer el stock mínimo de rodamientos (datos de demostración)', solicitadoPorId: admin.id,
      });
      await ds.getRepository(AuditLog).insert({
        usuarioId: admin.id, accion: 'COMPRA_SOLICITADA', entidad: 'compra', entidadId: sc.id,
        detalle: { codigo: `SC-${String(sc.numero).padStart(6, '0')}`, repuesto: rod.codigo, cantidad: 6, origen: 'Manual' } as never,
      });
    }

    // Calidad: puntos de control con límites, una plantilla de checklist y algunas lecturas.
    if ((await ds.getRepository(ControlPoint).count()) === 0) {
      const cf = await ds.getRepository(Asset).findOneByOrFail({ codigo: 'CF-001' });
      const hrn = await ds.getRepository(Asset).findOneByOrFail({ codigo: 'HRN-001' });
      const camara = await ds.getRepository(ControlPoint).save({ activoId: cf.id, nombre: 'Temperatura de cámara', minimo: 0, maximo: 4, frecuenciaHoras: 4 });
      await ds.getRepository(ControlPoint).save({ activoId: hrn.id, nombre: 'Centro térmico del producto', minimo: 72, maximo: null, frecuenciaHoras: 8 });
      for (const [horas, valor] of [[7, 2.1], [3, 3.4]] as const) {
        await ds.getRepository(TemperatureRecord).save({
          puntoId: camara.id, activoId: cf.id, valor, limiteMinimo: 0, limiteMaximo: 4, fueraDeRango: false,
          registradoEn: new Date(Date.now() - horas * 3_600_000), usuarioId: operario.id,
        });
      }
      await ds.getRepository(ChecklistTemplate).save({
        nombre: 'Pre-operacional y limpieza', area: 'Proceso',
        descripcion: 'Antes de iniciar el turno (datos de demostración)',
        items: [
          { id: 'limpio', texto: '¿Superficies en contacto con alimento limpias y desinfectadas?', tipo: 'SI_NO', obligatorio: true, esperado: 'SI' },
          { id: 'residuos', texto: '¿Hay residuos de producto del turno anterior?', tipo: 'SI_NO', obligatorio: true, esperado: 'NO' },
          { id: 'guardas', texto: '¿Guardas de seguridad instaladas?', tipo: 'SI_NO', obligatorio: true, esperado: 'SI' },
          { id: 'ppm', texto: 'Concentración de desinfectante (ppm)', tipo: 'NUMERO', obligatorio: true, minimo: 100, maximo: 200 },
          { id: 'novedad', texto: 'Novedades del turno anterior', tipo: 'TEXTO', obligatorio: false },
        ],
      } as never);
    }

    // Instrumentos de medición: uno vigente, uno por vencer y uno vencido.
    const dia = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
    for (const [codigo, nombre, tipo, area, fecha, vence] of [
      ['TER-001', 'Termómetro de punzón digital', 'TERMOMETRO', 'Planta Desposte', dia(-345), dia(20)],
      ['LUX-001', 'Luxómetro', 'LUXOMETRO', 'Mantenimiento', dia(-60), dia(305)],
      ['BAS-001', 'Báscula de recepción de canales', 'BASCULA', 'Planta Pollo', dia(-200), dia(-17)],
    ] as const) {
      const inst = await ds.getRepository(Instrument).save({ codigo, nombre, tipo, area, frecuenciaMeses: tipo === 'BASCULA' ? 6 : 12, marca: tipo === 'LUXOMETRO' ? 'Extech' : null });
      await ds.getRepository(Calibration).save({
        instrumentoId: inst.id, fecha, venceEn: vence, laboratorio: 'Metrología del Valle', numeroCertificado: `MV-${codigo}`, resultado: 'APTO', usuarioId: admin.id,
      });
    }

    // Los formatos reales de la planta (preoperacionales, hojas diarias, cuartos fríos, iluminación).
    const formatos = await cargarFormatos(ds, admin.id);
    console.log(`Formatos de la planta: ${formatos.plantillas} plantillas, ${formatos.instalaciones} cuartos fríos, ${formatos.puntosIluminacion} puntos de iluminación`);
    console.log('Datos de demostración cargados. Usuarios: autorizador / Autoriza2026, tecnico / PIN 4826, operario / PIN 7391');
  }

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
