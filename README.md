## awaitable-emit

Emit message to kafka and wait while nestjs process it.

### How it works

Create helper utils for end to end test:

- `emitMessage` - function to emit message to kafka
- `AwaitableEmitInterceptor` - nestjs global interceptor (required for emitMessage)
- `dispose` - function to run on test tear down stage

### Usage

1. Create helper objects

```ts
const { emitMessage, AwaitableEmitInterceptor, dispose } = createAwaitableEmit(...)`
```

2. Add interceptor to nestjs app

```ts
app.useGlobalInterceptors(new AwaitableEmitInterceptor());
```

3. Use `emitMessage` in tests
4. Run `dispose` in 'after all' stage

### Example

```ts
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @EventPattern('user-created')
  async handleEntityCreated(@Payload() payload: object) {
    console.log('user created', payload);
    await setTimeout(2000); // Imitate long running process
    this.appService.shared.push(payload);
  }
}
```

```ts
describe('AppController (e2e)', () => {
  let app: INestMicroservice;
  let clientKafka: ClientKafka;
  let service: AppService;

  const { emitMessage, AwaitableEmitInterceptor, dispose } =
    createAwaitableEmit({
      getKafkaClient: () => clientKafka,
      brokers: ['127.0.0.1:9092'],
    });

  // Before all
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

    app.useGlobalInterceptors(new AwaitableEmitInterceptor());

    await app.init();
    await app.listen();

    clientKafka = app.get<ClientKafka>('KAFKA_CLIENT');
    service = app.get(AppService);
  });

  // After all
  after(async () => {
    await dispose();
    await clientKafka?.close();
    await app?.close();
  });

  it('smoke', () => {
    expect(clientKafka).toBeTruthy();
  });

  it('test emit message', async () => {
    await emitMessage('user-created', {
      key: Date.now.toString(),
      value: { name: 'Bob' },
    });
    expect(service.shared.at(-1)).toEqual({ name: 'Bob' });
  });
});
```
