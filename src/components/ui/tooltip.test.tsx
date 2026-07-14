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
    // The trigger (with its aria-label) is always in the DOM; the content only
    // portals in on hover/focus, so we assert the trigger, not the tip text.
    expect(screen.getByRole("button", { name: "Attach a file" })).toBeInTheDocument();
  });
});
