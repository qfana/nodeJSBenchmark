import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { BenchmarkService } from './benchmark.service';

@Controller()
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      framework: 'nestjs',
      pid: process.pid,
      workerThreads: process.env.USE_WORKER_THREADS === 'true',
    };
  }

  @Get('api/static')
  getStatic() {
    return this.benchmarkService.getStaticJson();
  }

  @Post('api/transform')
  transform(@Body() body: unknown) {
    try {
      return this.benchmarkService.validateAndTransformHeavyJson(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid payload';
      throw new BadRequestException(message);
    }
  }

  @Get('api/io-simulate')
  ioSimulate(@Query('delay') delay?: string) {
    return this.benchmarkService.simulateIoDelay(delay);
  }

  @Post('api/hash')
  hash(@Body() body: { data?: unknown; rounds?: number }) {
    const rounds = body?.rounds || 1000;
    const data = body?.data || 'benchmark-payload';
    return this.benchmarkService.computeHash(data, rounds);
  }

  @Post('api/compute')
  compute(@Body() body: { size?: number }) {
    const size = body?.size || 1_000_000;
    return this.benchmarkService.computeArray(size);
  }

  @Get('api/counter')
  readCounter() {
    return this.benchmarkService.readCounter();
  }

  @Post('api/counter/increment')
  incrementCounter(@Body() body: { step?: number }) {
    const step = body?.step || 1;
    return this.benchmarkService.incrementCounter(step);
  }

  @Post('api/counter/reset')
  resetCounter() {
    return this.benchmarkService.resetCounter();
  }
}
