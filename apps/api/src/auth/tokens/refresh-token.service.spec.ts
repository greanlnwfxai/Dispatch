import { RefreshTokenService } from "./refresh-token.service";

describe("RefreshTokenService", () => {
  const service = new RefreshTokenService();

  it("generates a secret with at least 256 bits of entropy", () => {
    const { secret } = service.generateSecret();
    // base64url-encoded 32 bytes -> 43 chars (no padding).
    expect(secret.length).toBeGreaterThanOrEqual(43);
  });

  it("hashes the secret deterministically", () => {
    const { secret, hash } = service.generateSecret();
    expect(service.hashSecret(secret)).toBe(hash);
  });

  it("never includes the raw secret inside its own hash", () => {
    const { secret, hash } = service.generateSecret();
    expect(hash).not.toContain(secret);
  });

  it("builds and parses a token string round-trip", () => {
    const tokenRecordId = "11111111-1111-1111-1111-111111111111";
    const { secret } = service.generateSecret();
    const tokenString = service.buildTokenString(tokenRecordId, secret);
    const parsed = service.parseTokenString(tokenString);
    expect(parsed).toEqual({ tokenRecordId, secret });
  });

  it("rejects a malformed token string (no separator)", () => {
    expect(service.parseTokenString("not-a-valid-token")).toBeNull();
  });

  it("rejects a token string whose id segment is not a UUID", () => {
    expect(service.parseTokenString("not-a-uuid.somesecret")).toBeNull();
  });

  it("rejects a token string with an empty secret segment", () => {
    expect(service.parseTokenString("11111111-1111-1111-1111-111111111111.")).toBeNull();
  });

  it("matchesHash returns true only for the correct secret", () => {
    const { secret, hash } = service.generateSecret();
    expect(service.matchesHash(secret, hash)).toBe(true);
    expect(service.matchesHash("wrong-secret", hash)).toBe(false);
  });
});
