import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class GpuLeaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GpuLeaseService.name);
  private readonly key = 'video-saas:gpu:lease';
  private redis!: Redis;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async onModuleInit() {
    this.redis = new Redis({
      host: this.config.get<string>('redis.host', 'localhost'),
      port: this.config.get<number>('redis.port', 6379),
      maxRetriesPerRequest: null
    });
    await this.redis.ping();
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit();
  }

  async withLease<T>(label: string, operation: () => Promise<T>, onWaiting?: (owner: string | null) => Promise<void>): Promise<T> {
    const token = `${label}:${process.pid}:${randomUUID()}`;
    const ttlMs = this.config.get<number>('gpu.leaseTtlMs', 180_000);
    const pollMs = this.config.get<number>('gpu.leasePollMs', 1_000);
    let lastNotice = 0;
    while ((await this.redis.set(this.key, token, 'PX', ttlMs, 'NX')) !== 'OK') {
      if (Date.now() - lastNotice >= 5_000) {
        const owner = await this.redis.get(this.key);
        this.logger.log(`WAITING_GPU requester=${label} owner=${owner ?? 'unknown'}`);
        if (onWaiting) await onWaiting(owner);
        lastNotice = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    this.logger.log(`GPU_ACQUIRED ${token}`);
    const renewEvery = Math.max(5_000, Math.floor(ttlMs / 3));
    const timer = setInterval(() => {
      void this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
        1, this.key, token, String(ttlMs)
      ).then((renewed) => {
        if (Number(renewed) !== 1) this.logger.error(`GPU lease lost while active: ${token}`);
      }).catch((error) => this.logger.error(`GPU lease renewal failed: ${String(error)}`));
    }, renewEvery);
    try {
      return await operation();
    } finally {
      clearInterval(timer);
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1, this.key, token
      );
      this.logger.log(`GPU_RELEASED ${token}`);
    }
  }
}
