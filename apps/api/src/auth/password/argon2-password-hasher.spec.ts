import { Argon2PasswordHasher } from "./argon2-password-hasher";

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();
  // Test-only placeholder value — never a production credential.
  const PLAINTEXT = "correct-horse-battery-staple-test-only";

  it("produces an Argon2id PHC-format hash", async () => {
    const hashed = await hasher.hash(PLAINTEXT);
    expect(hashed).toMatch(/^\$argon2id\$/);
  });

  it("verifies a matching plaintext/hash pair", async () => {
    const hashed = await hasher.hash(PLAINTEXT);
    await expect(hasher.verify(hashed, PLAINTEXT)).resolves.toBe(true);
  });

  it("rejects a non-matching plaintext", async () => {
    const hashed = await hasher.hash(PLAINTEXT);
    await expect(hasher.verify(hashed, "wrong-password-test-only")).resolves.toBe(false);
  });

  it("never returns the plaintext password inside the hash output", async () => {
    const hashed = await hasher.hash(PLAINTEXT);
    expect(hashed).not.toContain(PLAINTEXT);
  });

  it("produces a different salt (and therefore a different hash) each time", async () => {
    const first = await hasher.hash(PLAINTEXT);
    const second = await hasher.hash(PLAINTEXT);
    expect(first).not.toBe(second);
  });
});
