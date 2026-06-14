import { Injectable } from '@nestjs/common';
import * as shared from '@benchmark/shared';

@Injectable()
export class BenchmarkService {
  getStaticJson() {
    return shared.getStaticJson();
  }

  validateAndTransformHeavyJson(body: unknown) {
    return shared.validateAndTransformHeavyJson(body);
  }

  simulateIoDelay(delayMs?: string | number) {
    return shared.simulateIoDelay(delayMs);
  }

  computeHash(data: unknown, rounds: number) {
    const useWorker = process.env.USE_WORKER_THREADS === 'true';
    return shared.computeHash(data, rounds, useWorker);
  }

  computeArray(size: number) {
    const useWorker = process.env.USE_WORKER_THREADS === 'true';
    return shared.computeArray(size, useWorker);
  }

  readCounter() {
    return shared.counterStore.read();
  }

  incrementCounter(step: number) {
    return shared.counterStore.increment(step);
  }

  resetCounter() {
    shared.counterStore.value = 0;
    shared.counterStore.reads = 0;
    shared.counterStore.writes = 0;
    return { reset: true, pid: process.pid };
  }
}
