import { describe, expect, it } from "vitest";
import { createBrandedId } from "./index";
import type {
  RoleRecord,
  RoleRepository,
  UserCredentialRecord,
  UserRecord,
  UserRepository,
} from "./index";

describe("createBrandedId", () => {
  it("returns the underlying string value", () => {
    const id = createBrandedId("ExampleId", "abc-123");
    expect(id).toBe("abc-123");
  });

  it("rejects an empty value", () => {
    expect(() => createBrandedId("ExampleId", "  ")).toThrow();
  });
});

describe("Identity/Role repository boundary", () => {
  it("UserRepository/RoleRepository stay framework/ORM-independent shapes", async () => {
    const user: UserRecord = {
      id: "11111111-1111-1111-1111-111111111111",
      displayName: "Example User",
      isActive: true,
      credentialsEnabled: false,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const userCredential: UserCredentialRecord = {
      ...user,
      loginIdNormalized: "example-login",
      passwordHash: "argon2id-hash-placeholder",
      credentialsUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const role: RoleRecord = {
      id: "22222222-2222-2222-2222-222222222222",
      code: "ADMIN",
      displayName: "Admin",
      isSystemRole: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    const userRepository: UserRepository = {
      findById: async (id) => (id === user.id ? user : null),
      findByLoginId: async (loginIdNormalized) =>
        loginIdNormalized === userCredential.loginIdNormalized ? userCredential : null,
    };
    const roleRepository: RoleRepository = {
      findByCode: async (code) => (code === role.code ? role : null),
      listAll: async () => [role],
    };

    await expect(userRepository.findById(user.id)).resolves.toEqual(user);
    await expect(userRepository.findByLoginId("example-login")).resolves.toEqual(userCredential);
    await expect(roleRepository.findByCode(role.code)).resolves.toEqual(role);
    await expect(roleRepository.listAll()).resolves.toEqual([role]);
  });
});
