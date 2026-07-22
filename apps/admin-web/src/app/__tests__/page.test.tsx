import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "../page";

describe("HomePage", () => {
  it("identifies itself as Dispatch Admin Web", () => {
    render(<HomePage />);
    expect(screen.getByText("Dispatch Admin Web")).toBeTruthy();
  });

  it("shows the backend health URL", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("link", { name: "http://localhost:6002/health" }),
    ).toBeTruthy();
  });
});
