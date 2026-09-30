import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`====================================================`);
  logger.log(`[Cockpit Forense SEACE - NestJS] Servidor activo`);
  logger.log(`Frontend UI: http://localhost:${port}`);
  logger.log(`API Endpoints: http://localhost:${port}/api/v1/cockpit/data`);
  logger.log(`====================================================`);
}

bootstrap();

