import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet());
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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',') });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API del CMMS escuchando en http://localhost:${port}/api`);
}

if (require.main === module) bootstrap();
