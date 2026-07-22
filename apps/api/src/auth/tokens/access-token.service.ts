import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AUTH_CONFIG, type AuthConfig } from "../config/auth.config";

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

/**
 * Short-lived signed JWT access token (AUTH-001). Carries only `sub`
 * (User ID), `sid` (AuthSession ID) and `jti` — no loginId, displayName,
 * role claims, or other PII. The JWT is never treated as the authorization
 * source of truth: JwtAuthenticationGuard re-resolves the principal
 * (session/user/roles) from PostgreSQL on every request.
 */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async issue(userId: string, sessionId: string): Promise<IssuedAccessToken> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.config.jwtAccessTtlSeconds;

    const token = await this.jwtService.signAsync(
      { sub: userId, sid: sessionId },
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.jwtAccessTtlSeconds,
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        jwtid: randomUUID(),
      },
    );

    return { token, expiresAt: new Date(expiresAt * 1000) };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    return this.jwtService.verifyAsync<AccessTokenClaims>(token, {
      secret: this.config.jwtAccessSecret,
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
    });
  }
}
