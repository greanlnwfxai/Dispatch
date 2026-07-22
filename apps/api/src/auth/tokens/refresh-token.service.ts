import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

const SECRET_BYTES = 32; // 256 bits of entropy, per AUTH-001 requirement.

export interface GeneratedRefreshTokenSecret {
  secret: string;
  hash: string;
}

/**
 * Opaque rotating refresh token (AUTH-001). Format: `<tokenRecordId>.<secret>`
 * — the id allows an indexed database lookup, the secret is a 256-bit
 * random value never persisted in raw form. A refresh token's entropy
 * already makes it computationally infeasible to guess or brute-force, so
 * a fast cryptographic hash (SHA-256) is appropriate here — unlike
 * passwords, which use the deliberately slow Argon2id (see
 * Argon2PasswordHasher) because human-chosen secrets have far less entropy.
 */
@Injectable()
export class RefreshTokenService {
  generateSecret(): GeneratedRefreshTokenSecret {
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    return { secret, hash: this.hashSecret(secret) };
  }

  hashSecret(secret: string): string {
    return createHash("sha256").update(secret, "utf8").digest("hex");
  }

  buildTokenString(tokenRecordId: string, secret: string): string {
    return `${tokenRecordId}.${secret}`;
  }

  parseTokenString(tokenString: string): { tokenRecordId: string; secret: string } | null {
    const separatorIndex = tokenString.indexOf(".");
    if (separatorIndex <= 0 || separatorIndex === tokenString.length - 1) {
      return null;
    }
    const tokenRecordId = tokenString.slice(0, separatorIndex);
    const secret = tokenString.slice(separatorIndex + 1);
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_PATTERN.test(tokenRecordId)) {
      return null;
    }
    return { tokenRecordId, secret };
  }

  /** Constant-time comparison against a stored hash — avoids timing side channels. */
  matchesHash(secret: string, storedHash: string): boolean {
    const candidateHash = Buffer.from(this.hashSecret(secret), "hex");
    const stored = Buffer.from(storedHash, "hex");
    if (candidateHash.length !== stored.length) {
      return false;
    }
    return timingSafeEqual(candidateHash, stored);
  }
}
