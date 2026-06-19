import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SlugService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService
  ) {}

  async generateUniqueOrganizationSlug(input: string): Promise<string> {
    const baseSlug = this.slugify(input);
    let slug = baseSlug;
    let suffix = 1;

    while (await this.slugExists(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private async slugExists(slug: string): Promise<boolean> {
    const organization = await this.prismaService.organization.findUnique({
      where: {
        slug
      },
      select: {
        id: true
      }
    });

    return Boolean(organization);
  }
}
