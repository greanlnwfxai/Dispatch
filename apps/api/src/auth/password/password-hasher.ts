export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(hash: string, plaintext: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
