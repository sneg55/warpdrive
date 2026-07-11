// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineEditFooter } from "./InlineEditFooter";

afterEach(cleanup);

describe("InlineEditFooter (PD ActionFooter)", () => {
  it("renders Cancel then Save and fires the handlers", () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(<InlineEditFooter onCancel={onCancel} onSave={onSave} saveDisabled={false} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Cancel", "Save"]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("disables Save (aria-disabled, no commit) until the draft is dirty", () => {
    const onSave = vi.fn();
    render(<InlineEditFooter onCancel={vi.fn()} onSave={onSave} saveDisabled={true} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("disables both buttons while a save is pending", () => {
    render(
      <InlineEditFooter onCancel={vi.fn()} onSave={vi.fn()} saveDisabled={false} pending={true} />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
