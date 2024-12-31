import { INestMicroservice, Provider } from '@nestjs/common';
import {
  ClientKafka,
  ClientProxyFactory,
  Transport,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import expect from 'expect';
import { createAwaitableEmit } from '../src';
import { AppModule, configureApp } from './app.module';

describe('AppController (e2e)', () => {
  let app: INestMicroservice;
  let clientKafka: ClientKafka;

  const { emitMessage, AwaitableEmitInterceptor } = createAwaitableEmit({
    getKafkaClient: () => clientKafka,
    brokers: ['127.0.0.1:9092'],
  });

  before(async () => {
    const providers: Provider[] = [
      {
        provide: 'KAFKA_CLIENT',
        useFactory: () => {
          return ClientProxyFactory.create({
            transport: Transport.KAFKA,
            options: {
              client: {
                clientId: 'KAFKA_CLIENT',
                brokers: ['127.0.0.1:9092'],
              },
            },
          });
        },
      },
    ];
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers,
    }).compile();

    app = testingModule.createNestMicroservice({
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'KAFKA_CLIENT',
          brokers: ['127.0.0.1:9092'],
        },
      },
    });

    configureApp(app);

    app.useGlobalInterceptors(new AwaitableEmitInterceptor());

    await app.init();
    await app.listen();

    clientKafka = app.get<ClientKafka>('KAFKA_CLIENT');
  });

  after(async () => {
    await app?.close();
    await clientKafka?.close();
  });

  it('smoke', () => {
    expect(clientKafka).toBeTruthy();
  });

  it('test emit message', async () => {
    await emitMessage('user-created', {
      key: Date.now.toString(),
      value: { name: 'Bob' },
    });
  });
});
