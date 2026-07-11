// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { VisibilityControl } from "./VisibilityControl";

describe("VisibilityControl", () => {
  it("renders the default visibility label", () => {
    render(<VisibilityControl label="Visible to everyone" />);
    expect(screen.getByText("Visible to everyone")).toBeInTheDocument();
  });

  it("renders a lock icon (aria-hidden svg or img)", () => {
    render(<VisibilityControl label="Visible to everyone" />);
    // Lock icon is decorative; it should be aria-hidden.
    const svg = document.querySelector("svg[aria-hidden='true']");
    expect(svg).not.toBeNull();
  });

  it("is non-interactive: the control wrapper has aria-disabled or is a plain span", () => {
    const { container } = render(<VisibilityControl label="Visible to everyone" />);
    // Must not contain any interactive button or input.
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("select")).toBeNull();
  });

  it("uses the provided label as display text", () => {
    render(<VisibilityControl label="Team only" />);
    expect(screen.getByText("Team only")).toBeInTheDocument();
  });
});
