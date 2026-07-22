import { parseArgs } from "./create-super-admin.cli";

describe("create-super-admin CLI argument parsing", () => {
  it("parses --key=value pairs", () => {
    expect(parseArgs(["--login-id=super.admin", "--display-name=Super Admin"])).toEqual({
      "login-id": "super.admin",
      "display-name": "Super Admin",
    });
  });

  it("ignores arguments without the -- prefix", () => {
    expect(parseArgs(["node", "script.js", "--login-id=x"])).toEqual({ "login-id": "x" });
  });

  it("ignores flags with no = separator", () => {
    expect(parseArgs(["--login-id=x", "--verbose"])).toEqual({ "login-id": "x" });
  });

  it("returns an empty object for no recognized arguments", () => {
    expect(parseArgs([])).toEqual({});
  });
});
