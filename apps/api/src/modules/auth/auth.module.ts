import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';

import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OrganizationService } from './services/organization.service';
import { PasswordService } from './services/password.service';
import { SlugService } from './services/slug.service';
import { UserContextService } from './services/user-context.service';
import { UserService } from './services/user.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwtSecret', 'change-me'),
        signOptions: {
          expiresIn: configService.get<string>('auth.jwtExpiresIn', '7d')
        } as JwtSignOptions
      })
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserService,
    OrganizationService,
    PasswordService,
    SlugService,
    UserContextService,
    JwtStrategy,
    JwtAuthGuard
  ],
  exports: [JwtAuthGuard, UserContextService]
})
export class AuthModule {}
