import { Injectable } from "@nestjs/common";
import type {
  AuthSessionRecord,
  CreateRefreshTokenInput,
  CreateSessionInput,
  RefreshTokenRecordShape,
  RotateRefreshTokenInput,
  SessionRepository,
} from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    return this.prisma.authSession.create({
      data: { userId: input.userId, expiresAt: input.expiresAt },
    });
  }

  async findSessionById(id: string): Promise<AuthSessionRecord | null> {
    return this.prisma.authSession.findUnique({ where: { id } });
  }

  async touchSessionLastSeen(id: string, lastSeenAt: Date): Promise<void> {
    await this.prisma.authSession.update({
      where: { id },
      data: { lastSeenAt },
    });
  }

  async revokeSession(id: string, reason: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllSessionsForUser(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  async createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshTokenRecordShape> {
    return this.prisma.refreshTokenRecord.create({
      data: {
        sessionId: input.sessionId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findRefreshTokenById(id: string): Promise<RefreshTokenRecordShape | null> {
    return this.prisma.refreshTokenRecord.findUnique({ where: { id } });
  }

  async revokeRefreshTokensForSession(sessionId: string): Promise<number> {
    const result = await this.prisma.refreshTokenRecord.updateMany({
      where: { sessionId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Atomic rotation: the conditional `updateMany` (`usedAt: null, revokedAt:
   * null`) is a single UPDATE statement that Postgres executes under a row
   * lock, so two concurrent rotation attempts against the same token can
   * never both report `count === 1` — the loser observes 0 rows affected
   * and returns `null`, which AuthService treats as reuse (see
   * SessionRepository doc comment).
   */
  async rotateRefreshToken(input: RotateRefreshTokenInput): Promise<RefreshTokenRecordShape | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.refreshTokenRecord.updateMany({
        where: { id: input.currentTokenId, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });

      if (claimed.count === 0) {
        return null;
      }

      const replacement = await tx.refreshTokenRecord.create({
        data: {
          sessionId: input.sessionId,
          tokenHash: input.newTokenHash,
          expiresAt: input.newExpiresAt,
        },
      });

      await tx.refreshTokenRecord.update({
        where: { id: input.currentTokenId },
        data: { replacedByTokenId: replacement.id },
      });

      return replacement;
    });
  }
}
