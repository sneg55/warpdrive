// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { INLINE_CONTROL_SURFACE } from "@/components/ui/inlineControlSurface";
import { ComposerFooter } from "./ComposerFooter";

function renderFooter(overrides: Partial<Parameters<typeof ComposerFooter>[0]> = {}) {
  return render(
    <ComposerFooter
      done={false}
      onDone={vi.fn()}
      pending={false}
      onDuplicate={vi.fn()}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      {...overrides}
    />,
  );
}

// Mark-as-done is the same checkbox-plus-label control as the email composer's add-as-activity, so
// it takes the same treatment: the visible text is part of the hit area and the whole control
// fills on hover.
describe("deal-workspace ComposerFooter mark-as-done", () => {
  it("toggles when the visible label text is clicked", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderFooter({ onDone });
    await user.click(screen.getByText("Mark as done"));
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("carries the shared inline hover surface", () => {
    renderFooter();
    const wrapper = screen.getByRole("checkbox", { name: "Mark as done" }).parentElement;
    expect(wrapper).toHaveClass("hover:bg-accent", "hover:text-foreground", "rounded-md");
    expect(INLINE_CONTROL_SURFACE).toContain("hover:bg-accent");
  });

  it("keeps the surrounding action bar's text size rather than shrinking to compose-bar type", () => {
    renderFooter();
    const wrapper = screen.getByRole("checkbox", { name: "Mark as done" }).parentElement;
    expect(wrapper).toHaveClass("text-sm");
    expect(wrapper).not.toHaveClass("text-xs");
  });
});
