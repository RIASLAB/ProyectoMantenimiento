import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import helmet from 'helmet';
import { join, resolve } from 'path';
import { AppModule } from './app.module';

export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // blob: para las vistas previas de fotos y documentos; sin recursos externos (la app funciona sin internet).
          'img-src': ["'self'", 'data:', 'blob:'],
          'script-src': ["'self'"],
          'worker-src': ["'self'"],
          'connect-src': ["'self'"],
          // En la red de la planta puede usarse por HTTP mientras se configura HTTPS.
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.set('trust proxy', 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos no declarados en los DTO
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  return app;
}

/**
 * Producción: el mismo servidor entrega la app compilada (frontend/dist) y la API, en un solo origen.
 * index.html y el service worker nunca se guardan en caché del navegador (así las actualizaciones llegan);
 * los archivos con hash en el nombre se guardan un año.
 */
export function servirFrontend(app: NestExpressApplication, dir: string) {
  const raiz = resolve(dir);
  const index = join(raiz, 'index.html');
  if (!existsSync(index)) throw new Error(`FRONTEND_DIR=${dir} no contiene index.html (¿se ejecutó npm run build en frontend?)`);
  // Comprime la app y las respuestas de la API (≈ 3 veces menos datos con 4G).
  app.use(compression());
  app.useStaticAssets(raiz, {
    index: false,
    setHeaders: (res, ruta) => {
      const inmutable = /[\\/]assets[\\/]/.test(ruta) || /workbox-[\w-]+\.js$/.test(ruta);
      res.setHeader('Cache-Control', inmutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
  // Rutas de la app (/ordenes/123, /calidad, …): siempre index.html; /api queda para la API.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  if (process.env.FRONTEND_DIR) servirFrontend(app, process.env.FRONTEND_DIR);
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',') });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API del CMMS escuchando en http://localhost:${port}/api`);
}

if (require.main === module) bootstrap();
