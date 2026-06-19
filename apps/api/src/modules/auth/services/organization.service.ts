import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Organization, User } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { SlugService } from './slug.service';

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(SlugService)
    private readonly slugService: SlugService
  ) {}

  async createPersonalWorkspace(userId: string, userName: string): Promise<Organization> {
    const baseName = `${userName.trim()} Workspace`;
    const slug = await this.slugService.generateUniqueOrganizationSlug(baseName);

    return this.prismaService.organization.create({
      data: {
        name: baseName,
        slug,
        members: {
          create: {
            userId,
            role: 'owner'
          }
        }
      }
    });
  }

  async getPrimaryOrganizationForUser(userId: string): Promise<Organization> {
    const membership = await this.prismaService.organizationMember.findFirst({
      where: {
        userId
      },
      include: {
        organization: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (!membership) {
      throw new NotFoundException('User organization not found');
    }

    return membership.organization;
  }

  findById(id: string): Promise<Organization | null> {
    return this.prismaService.organization.findUnique({
      where: {
        id
      }
    });
  }
}
