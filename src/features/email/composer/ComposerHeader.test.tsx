// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { ComposerHeader } from "./ComposerHeader";

describe("ComposerHeader", () => {
  it("links settings to /settings/email, calls onClose, and has no Automation control", () => {
    const onClose = vi.fn();
    render(<ComposerHeader onClose={onClose} />);
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/settings/email",
    );
    expect(screen.queryByText(/automation/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("omits the Close button when onClose is not provided (inbox reply)", () => {
    // ThreadPane renders the composer without onClose; a visible Close that no-ops is a dead
    // affordance. The Settings cog (a plain link) is still valid in that context.
    render(<ComposerHeader />);
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });
});
