// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

afterEach(cleanup);

describe("Input", () => {
  it("renders a native input and forwards the ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input aria-label="Name" ref={ref} />);
    const el = screen.getByLabelText("Name");
    expect(el.tagName).toBe("INPUT");
    expect(ref.current).toBe(el);
  });

  it("merges a passed className with the base classes via cn", () => {
    render(<Input aria-label="Name" className="w-40" />);
    const el = screen.getByLabelText("Name");
    // Base token class stays, and the caller's extra class is appended (not replaced).
    expect(el).toHaveClass("rounded-md");
    expect(el).toHaveClass("w-40");
  });

  it("forwards arbitrary native props (placeholder, disabled, type, onChange)", () => {
    const onChange = vi.fn();
    render(
      <Input
        aria-label="Email"
        type="email"
        placeholder="name@company.com"
        disabled
        onChange={onChange}
      />,
    );
    const el = screen.getByLabelText("Email");
    expect(el).toHaveAttribute("type", "email");
    expect(el).toHaveAttribute("placeholder", "name@company.com");
    expect(el).toBeDisabled();
    // onChange still fires when the field is not disabled: re-render enabled to assert wiring.
    render(<Input aria-label="Search" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "acme" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
