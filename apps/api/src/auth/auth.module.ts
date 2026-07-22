import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { RepositoriesModule } from "../infrastructure/database/repositories/repositories.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AUTH_CONFIG, loadAuthConfig } from "./config/auth.config";
import { JwtAuthenticationGuard } from "./guards/jwt-authentication.guard";
import { OriginGuard } from "./guards/origin.guard";
import { RolesGuard } from "./guards/roles.guard";
import { PASSWORD_HASHER } from "./password/password-hasher";
import { Argon2PasswordHasher } from "./password/argon2-password-hasher";
import { AccessTokenService } from "./tokens/access-token.service";
import { RefreshTokenService } from "./tokens/refresh-token.service";

/**
 * AUTH-001 authentication/RBAC module. `JwtAuthenticationGuard` is
 * registered globally (APP_GUARD) so every route requires a valid access
 * token unless explicitly marked `@Public()` — health endpoints and the
 * login/refresh/logout endpoints opt out explicitly rather than auth being
 * opt-in per route, which is the safer default for a growing route surface.
 */
@Module({
  imports: [
    RepositoriesModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: loadAuthConfig },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    AccessTokenService,
    RefreshTokenService,
    AuthService,
    OriginGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthenticationGuard },
  ],
  exports: [AUTH_CONFIG, AccessTokenService, RefreshTokenService, AuthService, RolesGuard],
})
export class AuthModule {}
