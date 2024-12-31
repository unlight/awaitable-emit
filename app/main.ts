import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module';
import { Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.connectMicroservice(
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'KAFKA_CLIENT',
          brokers: ['127.0.0.1:9092'],
        },
        consumer: {
          groupId: '1',
          allowAutoTopicCreation: true,
        },
      },
    },
    { inheritAppConfig: true },
  );

  await app.startAllMicroservices();
  await app.init();
  await app.listen(3000);
}

bootstrap();
