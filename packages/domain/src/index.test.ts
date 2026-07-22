import { describe, expect, it } from "vitest";
import { createBrandedId } from "./index";

describe("createBrandedId", () => {
  it("returns the underlying string value", () => {
    const id = createBrandedId("ExampleId", "abc-123");
    expect(id).toBe("abc-123");
  });

  it("rejects an empty value", () => {
    expect(() => createBrandedId("ExampleId", "  ")).toThrow();
  });
});
