import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as dotenv from 'dotenv';
import request from 'supertest';
import { DataSource } from 'typeorm';

dotenv.config();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.UPLOADS_DIR = './uploads-test';

/** Levanta la app contra una base de datos de pruebas limpia y devuelve un cliente HTTP con helpers. */
import { VERIFICACIONES_CIERRE } from '../src/common/enums';

/** Verificaciones de entrega del cierre de la OT, todas cumplidas. */
export const VERIF_OK = { verificaciones: VERIFICACIONES_CIERRE.map((v) => ({ id: v.id, cumple: true })) };

export async function bootstrap() {
  const { AppModule } = await import('../src/app.module');
  const { Rol } = await import('../src/common/enums');
  const { dataSourceOptions } = await import('../src/database/data-source');
  const { configureApp } = await import('../src/main');
  const { hashCredencial } = await import('../src/users/credentials');
  const { User } = await import('../src/users/user.entity');

  const ds = new DataSource(dataSourceOptions(process.env.TEST_DATABASE_URL));
  await ds.initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.runMigrations();
  // Las pruebas cubren inventario y compras: se encienden (en una planta nueva arrancan apagados, D-40).
  await ds.query(`UPDATE parametros SET valor = '{"inventario":true,"compras":true}' WHERE clave = 'modulos_activos'`);
  await ds.getRepository(User).save({ nombre: 'Admin Pruebas', usuario: 'admin', rol: Rol.ADMIN, principal: true, ...(await hashCredencial(Rol.ADMIN, 'Admin12345')) });
  await ds.destroy();

  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(mod.createNestApplication<NestExpressApplication>());
  await app.init();
  const http = request(app.getHttpServer()) as unknown as ReturnType<typeof request>;

  const login = async (usuario: string, credencial: string): Promise<string> => {
    const r = await http.post('/api/auth/login').send({ usuario, credencial });
    if (r.status !== 200) throw new Error(`login ${usuario}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.token;
  };
  const admin = await login('admin', 'Admin12345');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Crea un usuario y devuelve su id y token. */
  const usuario = async (usuario: string, rol: string, credencial: string) => {
    const r = await http.post('/api/usuarios').set(auth(admin)).send({ nombre: `Usuario ${usuario}`, usuario, rol, credencial });
    if (r.status !== 201) throw new Error(`crear ${usuario}: ${JSON.stringify(r.body)}`);
    // En las pruebas se omite el cambio obligatorio de credencial del primer ingreso (se prueba aparte).
    await app.get(DataSource).query('UPDATE usuarios SET debe_cambiar_credencial = false WHERE id = $1', [r.body.id]);
    return { id: r.body.id as string, token: await login(usuario, credencial) };
  };

  return { app, http, admin, auth, login, usuario };
}
