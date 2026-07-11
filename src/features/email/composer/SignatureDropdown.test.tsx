// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignatureDropdown } from "./SignatureDropdown";

afterEach(cleanup);

describe("SignatureDropdown", () => {
  it("opens the menu and selects a signature", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SignatureDropdown signatures={[{ id: "s1", name: "Work" }]} value="" onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /signature/i }));
    await user.click(screen.getByRole("menuitem", { name: "Work" }));
    expect(onChange).toHaveBeenCalledWith("s1");
  });

  it("closes the open menu on Escape", async () => {
    const user = userEvent.setup();
    render(
      <SignatureDropdown signatures={[{ id: "s1", name: "Work" }]} value="" onChange={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /signature/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
