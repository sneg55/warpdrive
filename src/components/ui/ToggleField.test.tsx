// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { INLINE_CONTROL_SURFACE } from "./inlineControlSurface";
import { ToggleField } from "./ToggleField";

// A control paired with a visible text label must behave like the composer's visibility picker:
// the label is part of the hit area and the whole control (box + text) takes the hover surface,
// rather than the box alone being clickable next to inert text.
describe("ToggleField", () => {
  it("toggles a checkbox when the visible label text is clicked", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ToggleField label="Add as activity" checked={false} onCheckedChange={onCheckedChange} />,
    );
    await user.click(screen.getByText("Add as activity"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles a switch when the visible label text is clicked", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ToggleField
        label="Opens"
        control="switch"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    await user.click(screen.getByText("Opens"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("gives the whole control the shared inline hover surface", () => {
    render(<ToggleField label="Add as activity" checked={false} onCheckedChange={vi.fn()} />);
    const wrapper = screen.getByRole("checkbox", { name: "Add as activity" }).parentElement;
    expect(wrapper).toHaveClass(...INLINE_CONTROL_SURFACE.split(" "));
  });

  it("does not toggle when an adornment beside the label is clicked", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ToggleField label="Add as activity" checked={false} onCheckedChange={onCheckedChange}>
        <span data-testid="info">i</span>
      </ToggleField>,
    );
    await user.click(screen.getByTestId("info"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("names the control exactly once so the label is not read twice", () => {
    render(<ToggleField label="Add as activity" checked={false} onCheckedChange={vi.fn()} />);
    expect(screen.getAllByRole("checkbox", { name: "Add as activity" })).toHaveLength(1);
  });

  it("can name the control more fully than the visible text", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ToggleField
        label="Opens"
        accessibleLabel="Track opens"
        control="switch"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(screen.getByRole("switch", { name: "Track opens" })).toBeInTheDocument();
    await user.click(screen.getByText("Opens"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("does not toggle a disabled control when its label is clicked", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ToggleField
        label="Add as activity"
        checked={false}
        disabled
        onCheckedChange={onCheckedChange}
      />,
    );
    await user.click(screen.getByText("Add as activity"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
