import { normalizeLoginId } from "./login-id";

describe("normalizeLoginId", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeLoginId("  jane.doe  ")).toBe("jane.doe");
  });

  it("lowercases the value", () => {
    expect(normalizeLoginId("Jane.Doe")).toBe("jane.doe");
  });

  it("combines trimming and lowercasing", () => {
    expect(normalizeLoginId("  JANE.DOE  ")).toBe("jane.doe");
  });

  it("treats differently-cased loginIds as equal after normalization", () => {
    expect(normalizeLoginId("SuperAdmin1")).toBe(normalizeLoginId("superadmin1"));
  });
});
