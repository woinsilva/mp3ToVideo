import { Injectable } from '@nestjs/common';
import type { Organization, User } from '@prisma/client';

@Injectable()
export class UserContextService {
  toOrganizationProfile(organization: Organization) {
    return {
      id: organization.id,
      name: organization.name
    };
  }

  toUserProfile(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email
    };
  }
}
