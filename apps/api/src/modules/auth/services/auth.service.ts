import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { LoginDto } from '../dtos/login.dto';
import { RegisterDto } from '../dtos/register.dto';
import { OrganizationService } from './organization.service';
import { PasswordService } from './password.service';
import { UserContextService } from './user-context.service';
import { UserService } from './user.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject(UserService)
    private readonly userService: UserService,
    @Inject(OrganizationService)
    private readonly organizationService: OrganizationService,
    @Inject(UserContextService)
    private readonly userContextService: UserContextService,
    @Inject(PasswordService)
    private readonly passwordService: PasswordService
  ) {}

  async register(input: RegisterDto) {
    const existingUser = await this.userService.findByEmail(input.email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordService.hash(input.password);
    const user = await this.userService.create({
      email: input.email.toLowerCase(),
      name: input.name.trim(),
      passwordHash
    });

    const organization = await this.organizationService.createPersonalWorkspace(user.id, user.name);
    const accessToken = await this.signToken(user.id, organization.id);

    return {
      accessToken,
      user: this.userContextService.toUserProfile(user),
      organization: this.userContextService.toOrganizationProfile(organization)
    };
  }

  async login(input: LoginDto) {
    const user = await this.userService.findByEmail(input.email.toLowerCase());

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.passwordService.compare(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const organization = await this.organizationService.getPrimaryOrganizationForUser(user.id);
    const accessToken = await this.signToken(user.id, organization.id);

    return {
      accessToken,
      user: this.userContextService.toUserProfile(user),
      organization: this.userContextService.toOrganizationProfile(organization)
    };
  }

  async getCurrentUserProfile(userId: string, organizationId: string) {
    const user = await this.userService.findById(userId);
    const organization = await this.organizationService.findById(organizationId);

    if (!user || !organization) {
      throw new UnauthorizedException('Authenticated user context is invalid');
    }

    return {
      user: this.userContextService.toUserProfile(user),
      organization: this.userContextService.toOrganizationProfile(organization)
    };
  }

  private signToken(userId: string, organizationId: string): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      organizationId
    });
  }
}
