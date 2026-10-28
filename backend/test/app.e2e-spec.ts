/**
 * Pruebas de extremo a extremo contra PostgreSQL real (TEST_DATABASE_URL).
 * Cada bloque referencia el requisito de la matriz que verifica.
 */
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as dotenv from 'dotenv';
import request from 'supertest';
import { DataSource } from 'typeorm';

dotenv.config();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.UPLOADS_DIR = './uploads-test';

import { AppModule } from '../src/app.module';
import { Rol } from '../src/common/enums';
import { dataSourceOptions } from '../src/database/data-source';
import { configureApp } from '../src/main';
import { hashCredencial } from '../src/users/credentials';
import { User } from '../src/users/user.entity';

let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let admin: string;
let adminId: string;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(usuario: string, credencial: string) {
  const r = await http.post('/api/auth/login').send({ usuario, credencial });
  return r;
}

async function crearUsuario(nombre: string, usuario: string, rol: Rol, credencial: string) {
  const r = await http.post('/api/usuarios').set(auth(admin)).send({ nombre, usuario, rol, credencial });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

beforeAll(async () => {
  // Base de datos limpia con las migraciones reales
  const ds = new DataSource(dataSourceOptions(process.env.TEST_DATABASE_URL));
  await ds.initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.runMigrations();
  const u = await ds.getRepository(User).save({
    nombre: 'Admin Pruebas', usuario: 'admin', rol: Rol.ADMIN, ...(await hashCredencial(Rol.ADMIN, 'Admin12345')),
  });
  adminId = u.id;
  await ds.destroy();

  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(mod.createNestApplication<NestExpressApplication>());
  await app.init();
  http = request(app.getHttpServer()) as unknown as ReturnType<typeof request>;
  admin = (await login('admin', 'Admin12345')).body.token;
});

afterAll(async () => {
  await app?.close();
});

describe('SEG-01/02/06 · Inicio de sesión', () => {
  it('ingresa con contraseña y devuelve token y rol', async () => {
    const r = await login('ADMIN', 'Admin12345'); // insensible a mayúsculas en el usuario
    expect(r.status).toBe(200);
    expect(r.body.token).toBeDefined();
    expect(r.body.usuario.rol).toBe('ADMIN');
  });

  it('usa el mismo mensaje para usuario inexistente y clave errada', async () => {
    const a = await login('noexiste', 'xxxx');
    const b = await login('admin', 'mala');
    expect(a.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('técnico/operario ingresan con PIN, no con contraseña', async () => {
    await crearUsuario('Operario Uno', 'op1', Rol.OPERARIO, '4826');
    expect((await login('op1', '4826')).status).toBe(200);
  });

  it('rechaza PIN débil y contraseña corta', async () => {
    const pin = await http.post('/api/usuarios').set(auth(admin)).send({ nombre: 'X Y Z', usuario: 'debil', rol: Rol.OPERARIO, credencial: '1111' });
    expect(pin.status).toBe(400);
    const pass = await http.post('/api/usuarios').set(auth(admin)).send({ nombre: 'X Y Z', usuario: 'debil2', rol: Rol.ADMIN, credencial: 'abc' });
    expect(pass.status).toBe(400);
  });

  it('bloquea el usuario tras 5 intentos fallidos, aun con la clave correcta', async () => {
    await crearUsuario('Técnico Bloqueo', 'tbloq', Rol.TECNICO, '5937');
    for (let i = 0; i < 5; i++) await login('tbloq', '0000');
    const r = await login('tbloq', '5937');
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/bloqueado/i);
  });

  it('exige token en endpoints protegidos', async () => {
    expect((await http.get('/api/activos')).status).toBe(401);
    expect((await http.get('/api/activos').set(auth('token-falso'))).status).toBe(401);
  });
});

describe('SEG-03/04 · Roles y gestión de usuarios', () => {
  let opToken: string;
  let opId: string;

  beforeAll(async () => {
    opId = await crearUsuario('Operario Dos', 'op2', Rol.OPERARIO, '6152');
    opToken = (await login('op2', '6152')).body.token;
  });

  it('el operario puede consultar máquinas pero no crearlas (bloqueado en la API)', async () => {
    expect((await http.get('/api/activos').set(auth(opToken))).status).toBe(200);
    const r = await http.post('/api/activos').set(auth(opToken)).send({ codigo: 'X-1', nombre: 'X', area: 'Proceso' });
    expect(r.status).toBe(403);
  });

  it('el operario no puede gestionar usuarios ni ver la bitácora', async () => {
    expect((await http.get('/api/usuarios').set(auth(opToken))).status).toBe(403);
    expect((await http.get('/api/bitacora').set(auth(opToken))).status).toBe(403);
  });

  it('al desactivar un usuario pierde el acceso de inmediato, aunque tenga token', async () => {
    const r = await http.patch(`/api/usuarios/${opId}`).set(auth(admin)).send({ activo: false });
    expect(r.status).toBe(200);
    expect((await http.get('/api/activos').set(auth(opToken))).status).toBe(401);
  });

  it('el administrador no puede desactivarse a sí mismo', async () => {
    const r = await http.patch(`/api/usuarios/${adminId}`).set(auth(admin)).send({ activo: false });
    expect(r.status).toBe(400);
  });

  it('nunca expone hashes de credenciales', async () => {
    const r = await http.get('/api/usuarios').set(auth(admin));
    expect(JSON.stringify(r.body)).not.toMatch(/Hash|\$2[aby]\$/);
  });

  it('rechaza campos no permitidos en el cuerpo', async () => {
    const r = await http.patch(`/api/usuarios/${opId}`).set(auth(admin)).send({ intentosFallidos: 0 });
    expect(r.status).toBe(400);
  });
});

describe('COM-04/05 · Autorizador configurable', () => {
  let autId: string;

  it('solo acepta usuarios con rol Autorizador', async () => {
    const tecId = await crearUsuario('Técnico Tres', 'tec3', Rol.TECNICO, '8264');
    const r = await http.put('/api/parametros/autorizador').set(auth(admin)).send({ usuarioId: tecId });
    expect(r.status).toBe(400);
  });

  it('cambia el autorizador sin programar y lo registra en bitácora', async () => {
    autId = await crearUsuario('Autorizador Uno', 'aut1', Rol.AUTORIZADOR, 'Autoriza2026');
    const r = await http.put('/api/parametros/autorizador').set(auth(admin)).send({ usuarioId: autId });
    expect(r.status).toBe(200);
    expect(r.body.autorizador.id).toBe(autId);

    const b = await http.get('/api/bitacora?entidad=parametro').set(auth(admin));
    expect(b.body.items[0].accion).toBe('AUTORIZADOR_CAMBIADO');
    expect(b.body.items[0].detalle.nuevo).toBe(autId);
  });

  it('impide desactivar o cambiar de rol al autorizador vigente', async () => {
    const r = await http.patch(`/api/usuarios/${autId}`).set(auth(admin)).send({ activo: false });
    expect(r.status).toBe(400);
  });
});

describe('ACT-01/02/03 · Máquinas', () => {
  let id: string;

  it('crea la ficha técnica y normaliza el código', async () => {
    const r = await http.post('/api/activos').set(auth(admin)).send({
      codigo: 'mol-001', nombre: 'Molino de carne', modelo: 'M-32', fabricante: 'Javar', area: 'Proceso',
      fechaCompra: '2021-03-15', fechaFinGarantia: '2023-03-15',
    });
    expect(r.status).toBe(201);
    expect(r.body.codigo).toBe('MOL-001');
    expect(r.body.estado).toBe('OPERATIVO');
    id = r.body.id;
  });

  it('no permite códigos duplicados', async () => {
    const r = await http.post('/api/activos').set(auth(admin)).send({ codigo: 'MOL-001', nombre: 'Otro', area: 'Proceso' });
    expect(r.status).toBe(409);
  });

  it('valida campos obligatorios y coherencia de fechas', async () => {
    expect((await http.post('/api/activos').set(auth(admin)).send({ codigo: 'X-2' })).status).toBe(400);
    const r = await http.post('/api/activos').set(auth(admin)).send({
      codigo: 'X-3', nombre: 'Equipo', area: 'Proceso', fechaCompra: '2024-01-10', fechaFinGarantia: '2023-01-10',
    });
    expect(r.status).toBe(400);
  });

  it('registra en bitácora los cambios con valor anterior y nuevo', async () => {
    await http.patch(`/api/activos/${id}`).set(auth(admin)).send({ estado: 'EN_MANTENIMIENTO' }).expect(200);
    const b = await http.get(`/api/bitacora?entidad=activo&entidadId=${id}`).set(auth(admin));
    expect(b.body.items[0].detalle.estado).toEqual({ antes: 'OPERATIVO', despues: 'EN_MANTENIMIENTO' });
  });

  it('adjunta un PDF, registra quién lo subió y permite descargarlo', async () => {
    const up = await http.post(`/api/activos/${id}/documentos`).set(auth(admin)).attach('archivo', PDF, { filename: 'manual molino.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect(up.body.archivo).toBeUndefined(); // la ruta interna no se expone

    const ficha = await http.get(`/api/activos/${id}`).set(auth(admin));
    expect(ficha.body.documentos).toHaveLength(1);
    expect(ficha.body.documentos[0].subidoPor.nombre).toBe('Admin Pruebas');

    const dl = await http.get(`/api/activos/documentos/${up.body.id}/archivo`).set(auth(admin));
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('application/pdf');
  });

  it('el administrador elimina un documento; queda en la bitácora y el archivo se borra', async () => {
    const up = await http.post(`/api/activos/${id}/documentos`).set(auth(admin)).attach('archivo', PDF, { filename: 'manual equivocado.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    await http.post('/api/usuarios').set(auth(admin)).send({ nombre: 'Técnico Docs', usuario: 'tecdocs', rol: 'TECNICO', credencial: '7351' }).expect(201);
    const tec = (await http.post('/api/auth/login').send({ usuario: 'tecdocs', credencial: '7351' })).body.token;
    expect((await http.delete(`/api/activos/documentos/${up.body.id}`).set(auth(tec))).status).toBe(403);

    const r = await http.delete(`/api/activos/documentos/${up.body.id}`).set(auth(admin));
    expect(r.status).toBe(200);
    const ficha = await http.get(`/api/activos/${id}`).set(auth(admin));
    expect(ficha.body.documentos.map((d: { nombreOriginal: string }) => d.nombreOriginal)).toEqual(['manual molino.pdf']);
    expect((await http.get(`/api/activos/documentos/${up.body.id}/archivo`).set(auth(admin))).status).toBe(404);
    const b = await http.get(`/api/bitacora?entidad=activo&entidadId=${id}`).set(auth(admin));
    expect(b.body.items[0]).toMatchObject({ accion: 'DOCUMENTO_ELIMINADO', detalle: { documento: 'manual equivocado.pdf' } });
    expect((await http.delete(`/api/activos/documentos/${up.body.id}`).set(auth(admin))).status).toBe(404);
  });

  it('rechaza un archivo que dice ser PDF pero no lo es', async () => {
    const r = await http.post(`/api/activos/${id}/documentos`).set(auth(admin))
      .attach('archivo', Buffer.from('MZ ejecutable'), { filename: 'virus.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
  });

  it('busca por código, nombre o fabricante', async () => {
    const r = await http.get('/api/activos?q=javar').set(auth(admin));
    expect(r.body.map((a: { codigo: string }) => a.codigo)).toEqual(['MOL-001']);
  });
});

describe('INV · Inventario de repuestos', () => {
  let rid: string;
  const mov = (body: object) => http.post('/api/inventario/movimientos').set(auth(admin)).send(body);

  it('INV-01 · crea el repuesto con stock 0', async () => {
    const r = await http.post('/api/repuestos').set(auth(admin)).send({ codigo: 'rod-6205', descripcion: 'Rodamiento 6205', unidad: 'und', stockMinimo: 5 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ codigo: 'ROD-6205', unidad: 'UND', stock: 0, bajoMinimo: true });
    rid = r.body.id;
  });

  it('INV-02/08 · las compras actualizan el costo promedio ponderado', async () => {
    expect((await mov({ repuestoId: rid, tipo: 'ENTRADA_COMPRA', cantidad: 10, costoUnitario: 100 })).status).toBe(201);
    expect((await mov({ repuestoId: rid, tipo: 'ENTRADA_COMPRA', cantidad: 10, costoUnitario: 200 })).status).toBe(201);
    const r = await http.get(`/api/repuestos/${rid}`).set(auth(admin));
    expect(r.body).toMatchObject({ stock: 20, costoPromedio: 150, valorInventario: 3000, bajoMinimo: false });
  });

  it('INV-02 · la compra exige costo unitario y los ajustes exigen motivo', async () => {
    expect((await mov({ repuestoId: rid, tipo: 'ENTRADA_COMPRA', cantidad: 1 })).status).toBe(400);
    expect((await mov({ repuestoId: rid, tipo: 'SALIDA_AJUSTE', cantidad: 1 })).status).toBe(400);
  });

  it('INV-03 · el consumo exige referencia de OT y sale al costo promedio', async () => {
    expect((await mov({ repuestoId: rid, tipo: 'SALIDA_CONSUMO', cantidad: 3 })).status).toBe(400);
    const r = await mov({ repuestoId: rid, tipo: 'SALIDA_CONSUMO', cantidad: 3, referencia: 'OT-0001' });
    expect(r.status).toBe(201);
    expect(r.body.movimiento).toMatchObject({ cantidad: -3, costoUnitario: 150 });
    expect(r.body.stockResultante).toBe(17);
  });

  it('D-02 · bloquea salidas en línea sin stock suficiente', async () => {
    const r = await mov({ repuestoId: rid, tipo: 'SALIDA_CONSUMO', cantidad: 100, referencia: 'OT-0002' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Stock insuficiente/);
  });

  it('OFF-02 · un movimiento reenviado con el mismo clientId no se duplica', async () => {
    const clientId = '0b7c7f1e-6a43-4f0e-9a1e-0d2b0f1c2a11';
    const a = await mov({ repuestoId: rid, tipo: 'SALIDA_CONSUMO', cantidad: 1, referencia: 'OT-0003', clientId });
    const b = await mov({ repuestoId: rid, tipo: 'SALIDA_CONSUMO', cantidad: 1, referencia: 'OT-0003', clientId });
    expect(a.body.duplicado).toBe(false);
    expect(b.body.duplicado).toBe(true);
    expect(b.body.movimiento.id).toBe(a.body.movimiento.id);
    expect((await http.get(`/api/repuestos/${rid}`).set(auth(admin))).body.stock).toBe(16);
  });

  it('INV-07 · el conteo físico genera el ajuste por la diferencia', async () => {
    const r = await http.post('/api/inventario/conteos').set(auth(admin)).send({ repuestoId: rid, cantidadContada: 14, motivo: 'Conteo mensual' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ stockSistema: 16, diferencia: -2 });
    expect(r.body.movimiento.tipo).toBe('SALIDA_AJUSTE');
  });

  it('INV-04 · el saldo final del kardex coincide con el stock mostrado', async () => {
    const k = await http.get(`/api/repuestos/${rid}/kardex`).set(auth(admin));
    const stock = (await http.get(`/api/repuestos/${rid}`).set(auth(admin))).body.stock;
    expect(k.body.movimientos).toHaveLength(5);
    expect(k.body.movimientos.at(-1).saldo).toBe(stock);
    expect(stock).toBe(14);
  });

  it('INV-03 · los movimientos son inmutables incluso directo en la base de datos', async () => {
    const ds = app.get(DataSource);
    await expect(ds.query('UPDATE movimientos_inventario SET cantidad = 999')).rejects.toThrow(/solo inserción/);
    await expect(ds.query('DELETE FROM bitacora')).rejects.toThrow(/solo inserción/);
  });

  it('INV-09 · exporta el inventario a CSV legible por Excel', async () => {
    const r = await http.get('/api/inventario/exportar').set(auth(admin));
    expect(r.status).toBe(200);
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    expect(r.text).toContain('ROD-6205;;Rodamiento 6205;UND;;14;5;No;150;2100;Sí');
  });

  it('INV-06 · filtra repuestos bajo el mínimo', async () => {
    await http.post('/api/repuestos').set(auth(admin)).send({ codigo: 'ACE-H1', descripcion: 'Aceite H1', unidad: 'L', stockMinimo: 10 });
    const r = await http.get('/api/repuestos?bajoMinimo=true').set(auth(admin));
    expect(r.body.map((x: { codigo: string }) => x.codigo)).toEqual(['ACE-H1']);
  });

  it('dos salidas simultáneas no dejan el stock negativo', async () => {
    const p = await http.post('/api/repuestos').set(auth(admin)).send({ codigo: 'SIM-1', descripcion: 'Prueba concurrencia', unidad: 'UND' });
    await mov({ repuestoId: p.body.id, tipo: 'ENTRADA_COMPRA', cantidad: 5, costoUnitario: 10 });
    const rs = await Promise.all(
      Array.from({ length: 4 }, (_, i) => mov({ repuestoId: p.body.id, tipo: 'SALIDA_CONSUMO', cantidad: 2, referencia: `OT-C${i}` })),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(2);
    expect((await http.get(`/api/repuestos/${p.body.id}`).set(auth(admin))).body.stock).toBe(1);
  });
});
