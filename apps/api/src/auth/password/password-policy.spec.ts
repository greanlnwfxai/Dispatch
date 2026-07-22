import { validatePasswordPolicy } from "./password-policy";

const POLICY = { minLength: 12, maxLength: 128 };

describe("validatePasswordPolicy", () => {
  it("rejects an empty password", () => {
    expect(validatePasswordPolicy("", POLICY)).not.toBeNull();
  });

  it("rejects a password shorter than the minimum length", () => {
    expect(validatePasswordPolicy("short1234", POLICY)).not.toBeNull();
  });

  it("rejects a password longer than the maximum length", () => {
    expect(validatePasswordPolicy("a".repeat(129), POLICY)).not.toBeNull();
  });

  it("accepts a password at exactly the minimum length", () => {
    expect(validatePasswordPolicy("a".repeat(12), POLICY)).toBeNull();
  });

  it("accepts a password at exactly the maximum length", () => {
    expect(validatePasswordPolicy("a".repeat(128), POLICY)).toBeNull();
  });

  it("does not require any character-composition rule (no forced symbol/uppercase mix)", () => {
    expect(validatePasswordPolicy("alllowercaseletters", POLICY)).toBeNull();
  });
});
