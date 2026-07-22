import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { DispatchRoleCode } from "@dispatch/shared-types";
import { isDispatchRoleCode } from "@dispatch/shared-types";
import { PrismaSessionRepository } from "../infrastructure/database/repositories/prisma-session.repository";
import { PrismaUserRepository } from "../infrastructure/database/repositories/prisma-user.repository";
import { PrismaUserRoleAssignmentRepository } from "../infrastructure/database/repositories/prisma-user-role-assignment.repository";
import { AUTH_CONFIG, type AuthConfig } from "./config/auth.config";
import { normalizeLoginId } from "./login-id";
import { PASSWORD_HASHER, type PasswordHasher } from "./password/password-hasher";
import { AccessTokenService } from "./tokens/access-token.service";
import { RefreshTokenService } from "./tokens/refresh-token.service";

const GENERIC_LOGIN_ERROR = "Invalid loginId or password.";
const GENERIC_REFRESH_ERROR = "Invalid or expired refresh token.";

/**
 * A fixed, valid Argon2id hash used only to burn comparable CPU time when
 * no matching user exists — reduces (does not eliminate) a login-timing
 * side channel that could otherwise reveal loginId existence.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$MDAwMDAwMDAwMDAwMDAwMA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface SafePrincipal {
  userId: string;
  displayName: string;
  roleCodes: DispatchRoleCode[];
}

export interface AuthResult {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  principal: SafePrincipal;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly sessionRepository: PrismaSessionRepository,
    private readonly userRepository: PrismaUserRepository,
    private readonly roleAssignmentRepository: PrismaUserRoleAssignmentRepository,
  ) {}

  async login(rawLoginId: string, password: string): Promise<AuthResult> {
    const loginIdNormalized = normalizeLoginId(rawLoginId);
    const user = await this.userRepository.findByLoginId(loginIdNormalized);

    if (!user || !user.credentialsEnabled || !user.passwordHash) {
      // Burn comparable time even when there is no user/hash to compare
      // against, so response timing does not reveal whether loginId exists.
      await this.passwordHasher.verify(DUMMY_HASH, password);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (!user.isActive) {
      await this.passwordHasher.verify(DUMMY_HASH, password);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const passwordMatches = await this.passwordHasher.verify(user.passwordHash, password);
    if (!passwordMatches) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const roleCodes = (await this.roleAssignmentRepository.listRoleCodesForUser(user.id)).filter(
      isDispatchRoleCode,
    );

    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + this.config.sessionAbsoluteTtlSeconds * 1000);
    const session = await this.sessionRepository.createSession({
      userId: user.id,
      expiresAt: sessionExpiresAt,
    });

    const { secret, hash } = this.refreshTokenService.generateSecret();
    const refreshExpiresAt = this.capToSessionExpiry(
      new Date(now.getTime() + this.config.refreshTtlSeconds * 1000),
      sessionExpiresAt,
    );
    const tokenRecord = await this.sessionRepository.createRefreshToken({
      sessionId: session.id,
      tokenHash: hash,
      expiresAt: refreshExpiresAt,
    });

    const accessToken = await this.accessTokenService.issue(user.id, session.id);

    return {
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken: this.refreshTokenService.buildTokenString(tokenRecord.id, secret),
      refreshTokenExpiresAt: tokenRecord.expiresAt,
      principal: { userId: user.id, displayName: user.displayName, roleCodes },
    };
  }

  async refresh(refreshTokenString: string): Promise<AuthResult> {
    const parsed = this.refreshTokenService.parseTokenString(refreshTokenString);
    if (!parsed) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const record = await this.sessionRepository.findRefreshTokenById(parsed.tokenRecordId);
    if (!record || !this.refreshTokenService.matchesHash(parsed.secret, record.tokenHash)) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const now = new Date();

    if (record.usedAt !== null || record.revokedAt !== null) {
      // Reuse of an already-used/revoked token: treat the session as
      // compromised and revoke it immediately.
      await this.sessionRepository.revokeSession(record.sessionId, "refresh_token_reuse");
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    if (record.expiresAt <= now) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const session = await this.sessionRepository.findSessionById(record.sessionId);
    if (!session || session.revokedAt !== null || session.expiresAt <= now) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const user = await this.userRepository.findById(session.userId);
    if (!user || !user.isActive || !user.credentialsEnabled) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const { secret, hash } = this.refreshTokenService.generateSecret();
    const newExpiresAt = this.capToSessionExpiry(
      new Date(now.getTime() + this.config.refreshTtlSeconds * 1000),
      session.expiresAt,
    );

    const rotated = await this.sessionRepository.rotateRefreshToken({
      currentTokenId: record.id,
      sessionId: session.id,
      newTokenHash: hash,
      newExpiresAt,
    });

    if (!rotated) {
      // Lost a concurrent rotation race against the same token — treat as
      // reuse and revoke the session rather than issue a second valid
      // replacement.
      await this.sessionRepository.revokeSession(session.id, "refresh_token_concurrent_reuse");
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    await this.sessionRepository.touchSessionLastSeen(session.id, now);

    const roleCodes = (await this.roleAssignmentRepository.listRoleCodesForUser(user.id)).filter(
      isDispatchRoleCode,
    );
    const accessToken = await this.accessTokenService.issue(user.id, session.id);

    return {
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken: this.refreshTokenService.buildTokenString(rotated.id, secret),
      refreshTokenExpiresAt: rotated.expiresAt,
      principal: { userId: user.id, displayName: user.displayName, roleCodes },
    };
  }

  /** Idempotent — never reveals whether the presented token was valid. */
  async logout(refreshTokenString: string | undefined): Promise<void> {
    if (!refreshTokenString) {
      return;
    }
    const parsed = this.refreshTokenService.parseTokenString(refreshTokenString);
    if (!parsed) {
      return;
    }
    const record = await this.sessionRepository.findRefreshTokenById(parsed.tokenRecordId);
    if (!record || !this.refreshTokenService.matchesHash(parsed.secret, record.tokenHash)) {
      return;
    }
    await this.sessionRepository.revokeSession(record.sessionId, "logout");
    await this.sessionRepository.revokeRefreshTokensForSession(record.sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionRepository.revokeAllSessionsForUser(userId, "logout_all");
  }

  private capToSessionExpiry(candidate: Date, sessionExpiresAt: Date): Date {
    return candidate.getTime() < sessionExpiresAt.getTime() ? candidate : sessionExpiresAt;
  }
}
