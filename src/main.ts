import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Common Auth API')
    .setDescription('Authentication and user administration API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup(
    process.env.SWAGGER_PATH ?? 'docs',
    app,
    swaggerDocument,
    {
      swaggerOptions: {
        persistAuthorization: true,
      },
    },
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
