import { describe, expect, it } from "vitest";
import { assertDefined, requireEnv } from "./index";

describe("assertDefined", () => {
  it("returns the value when defined", () => {
    expect(assertDefined("value", "should not throw")).toBe("value");
  });

  it("throws when null or undefined", () => {
    expect(() => assertDefined(undefined, "boom")).toThrow("boom");
    expect(() => assertDefined(null, "boom")).toThrow("boom");
  });
});

describe("requireEnv", () => {
  it("returns the variable when present", () => {
    expect(requireEnv("FOO", { FOO: "bar" })).toBe("bar");
  });

  it("throws a descriptive error when missing", () => {
    expect(() => requireEnv("MISSING", {})).toThrow(
      "Missing required environment variable: MISSING",
    );
  });
});
