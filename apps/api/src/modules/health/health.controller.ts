import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService
  ) {}

  @Get()
  async getHealth() {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'api',
        database: 'unreachable'
      });
    }

    return {
      status: 'ok',
      service: 'api',
      database: 'ok'
    };
  }
}
