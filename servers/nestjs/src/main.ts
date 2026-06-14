import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';

const shared = require('@benchmark/shared');

export const PORT = Number(process.env.PORT || 3003);

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });

  app.use(json({ limit: shared.BODY_LIMIT_BYTES }));

  await app.listen(PORT);
  console.log(`NestJS on http://localhost:${PORT}`);
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
