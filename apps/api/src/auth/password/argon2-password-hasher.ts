import { Injectable } from "@nestjs/common";
import { hash, verify, type Options } from "@node-rs/argon2";
import type { PasswordHasher } from "./password-hasher";

// `Algorithm` is declared `export declare const enum` by @node-rs/argon2's
// generated types, which cannot be imported under `isolatedModules` (each
// file must be independently transpilable — const enums require full
// cross-file type information to inline). `2` is `Algorithm.Argon2id`, the
// library's own default/recommended value; passed explicitly here anyway
// per the AUTH-001 "explicit Argon2id configuration" requirement.
const ARGON2ID = 2;

/**
 * Argon2id via @node-rs/argon2 (prebuilt native bindings — works on the
 * Alpine/musl production image without a gyp build step). The library
 * generates its own salt; only the resulting PHC-format hash string is
 * ever persisted (see Prisma `User.passwordHash`) — the plaintext password
 * is never logged, stored, or echoed anywhere.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private static readonly OPTIONS: Options = {
    algorithm: ARGON2ID,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, Argon2PasswordHasher.OPTIONS);
  }

  async verify(hashed: string, plaintext: string): Promise<boolean> {
    return verify(hashed, plaintext, Argon2PasswordHasher.OPTIONS);
  }
}
