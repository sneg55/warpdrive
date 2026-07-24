// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ColorPicker } from "./ColorPicker";

afterEach(cleanup);

it("shows its tooltip from the actual popover trigger", async () => {
  render(<ColorPicker value="#000000" onChange={vi.fn()} ariaLabel="Text color" />);

  await userEvent.hover(screen.getByRole("button", { name: "Text color" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Text color");
});

it("chooses a palette color without a native color input", async () => {
  const onChange = vi.fn();
  render(<ColorPicker value="#000000" onChange={onChange} ariaLabel="Text color" />);

  await userEvent.click(screen.getByRole("button", { name: "Text color" }));
  expect(document.querySelector('input[type="color"]')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Red" }));
  expect(onChange).toHaveBeenCalledWith("#dc2626");
});

it("accepts a valid custom hex value and rejects an invalid one inline", async () => {
  const onChange = vi.fn();
  render(<ColorPicker value="#000000" onChange={onChange} ariaLabel="Text color" />);

  await userEvent.click(screen.getByRole("button", { name: "Text color" }));
  const input = screen.getByRole("textbox", { name: "Custom hex color" });
  await userEvent.clear(input);
  await userEvent.type(input, "nope");
  await userEvent.click(screen.getByRole("button", { name: "Apply color" }));
  expect(screen.getByRole("alert")).toHaveTextContent("6-digit hex");
  expect(onChange).not.toHaveBeenCalled();

  await userEvent.clear(input);
  await userEvent.type(input, "#123abc");
  await userEvent.click(screen.getByRole("button", { name: "Apply color" }));
  expect(onChange).toHaveBeenCalledWith("#123abc");
});
