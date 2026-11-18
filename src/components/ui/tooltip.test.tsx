// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tip, TooltipProvider } from "./tooltip";

describe("Tip", () => {
  it("renders the trigger child and preserves its accessible name", () => {
    render(
      <TooltipProvider>
        <Tip label="Attach a file">
          <button type="button" aria-label="Attach a file">
            +
          </button>
        </Tip>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Attach a file" })).toBeInTheDocument();
  });
});
