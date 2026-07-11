// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerBadge } from "./OwnerBadge";

afterEach(() => cleanup());

describe("OwnerBadge", () => {
  it("renders a humanized name and avatar without exposing the raw email", () => {
    render(<OwnerBadge name="jane.doe@example.com" />);

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Jane Doe" })).toBeInTheDocument();
    expect(screen.queryByText("jane.doe@example.com")).not.toBeInTheDocument();
  });

  it("uses the formatted name for an avatar image alt", () => {
    render(<OwnerBadge name="demo1@example.com" avatarUrl="/avatar.png" />);

    const avatar = screen.getByRole("img", { name: "Demo1" });
    expect(avatar).toHaveAttribute("src", "/avatar.png");
    expect(screen.queryByText("demo1@example.com")).not.toBeInTheDocument();
  });

  it("renders Unassigned for a null owner", () => {
    render(<OwnerBadge name={null} />);

    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Unassigned" })).toBeInTheDocument();
  });
});
