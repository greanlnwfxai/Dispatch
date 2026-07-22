import { describe, expect, it } from "vitest";
import manifest from "../manifest";

describe("PWA manifest", () => {
  it("declares the required web app manifest fields", () => {
    const result = manifest();
    expect(result.name).toBe("Dispatch Mobile/PWA");
    expect(result.short_name).toBe("Dispatch");
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
  });
});
