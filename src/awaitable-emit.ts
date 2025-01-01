import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { ClientKafka, KafkaContext } from '@nestjs/microservices';
import { EventEmitter } from 'events';
import { Admin, Kafka } from 'kafkajs';
import { setTimeout } from 'node:timers/promises';
import {
  catchError,
  delay,
  firstValueFrom,
  fromEvent,
  lastValueFrom,
  map,
  Observable,
  ObservableInput,
  of,
  race,
} from 'rxjs';

interface Data {
  key: string;
}

interface CreateAwaitableEmitArgs {
  getKafkaClient: () => ClientKafka;
  wait?: number;
  brokers?: string[];
}

/**
 * Create helper utils:
 * emitMessage - function to emit message to kafka
 * AwaitableEmitInterceptor - nestjs global interceptor (required for emitMessage)
 * dispose - function to run on tear down stage
 */
export function createAwaitableEmit(args: CreateAwaitableEmitArgs) {
  const { getKafkaClient, brokers, wait = 5000 } = args;
  const emitter = new EventEmitter();

  const createEventName = (messageId: string): string =>
    `awaitable emit ${messageId}`;
  const createErrorEventName = (messageId: string): string =>
    `awaitable emit error ${messageId}`;
  const admin = brokers
    ? new Kafka({ clientId: 'awaitable-emit', brokers }).admin()
    : undefined;

  const emitMessage = async <T extends Data>(
    topic: string,
    data: T,
  ): Promise<void> => {
    const raceConditions = [
      fromEvent(emitter, createEventName(data.key)),
      fromEvent(emitter, createErrorEventName(data.key)).pipe(
        map(err => {
          throw err;
        }),
      ),
      of(1).pipe(delay(wait)),
    ];

    await emitMessageDefault(topic, data, { raceConditions });
    if (admin) await waitGroupsOffset({ topic, admin });
  };

  const emitRetryableMessage = async <T extends Data>(
    topic: string,
    data: T,
  ): Promise<void> => {
    const raceConditions = [
      fromEvent(emitter, createEventName(data.key)),
      of(1).pipe(delay(wait)),
    ];

    await emitMessageDefault(topic, data, { raceConditions });
  };

  async function emitMessageDefault<T extends Data>(
    topic: string,
    data: T,
    options: {
      raceConditions: ObservableInput<unknown>[];
    },
  ): Promise<void> {
    const { raceConditions } = options;

    await lastValueFrom(getKafkaClient().emit(topic, data));
    await firstValueFrom(race(...raceConditions));
  }

  class AwaitableEmitInterceptor implements NestInterceptor {
    public intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Observable<unknown> | Promise<Observable<unknown>> {
      const rpcHostArguments = context.switchToRpc();
      const kafkaContext = rpcHostArguments.getContext<KafkaContext>();
      const { key } = kafkaContext.getMessage();
      const messageKey = String(key?.toString());

      return next.handle().pipe(
        map(() => emitter.emit(createEventName(messageKey))),
        catchError(err => {
          emitter.emit(createErrorEventName(messageKey), err);
          throw err;
        }),
      );
    }
  }

  interface WaitGroupsOffsetArgs {
    topic: string;
    admin: Admin;
  }

  async function waitGroupsOffset(args: WaitGroupsOffsetArgs) {
    const { topic, admin } = args;
    const offsets = await admin.fetchTopicOffsets(topic);
    const firstOffset = parseInt(offsets[0]?.offset || '-1', 10);

    if (firstOffset === -1) return;

    const groups = await admin.listGroups();

    while (true) {
      const offsetChecks = [] as boolean[];
      for (const group of groups.groups) {
        const offsets = await admin.fetchOffsets({
          groupId: group.groupId,
          topics: [topic],
        });
        const groupOffset = parseInt(
          offsets[0]?.partitions[0]?.offset || '-1',
          10,
        );
        if (groupOffset === -1) continue;
        offsetChecks[offsetChecks.length] = firstOffset === groupOffset;
      }
      if (offsetChecks.every(Boolean)) break;
      await setTimeout(100);
    }
  }

  async function dispose() {
    await admin?.disconnect();
  }

  return {
    AwaitableEmitInterceptor,
    emitMessage,
    emitRetryableMessage,
    dispose,
  };
}
