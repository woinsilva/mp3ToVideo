import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionService.name);
  private redis?: Redis;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);

    this.redis = new Redis({
      host,
      port,
      maxRetriesPerRequest: 1,
      lazyConnect: true
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });

    try {
      await this.redis.connect();
      const pong = await this.redis.ping();
      this.logger.log(`Connected to Redis at ${host}:${port} (${pong})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Redis connection error';
      this.logger.error(`Unable to connect to Redis at ${host}:${port}: ${message}`);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    }
  }
}
