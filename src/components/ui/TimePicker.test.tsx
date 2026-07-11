// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimePicker } from "./TimePicker";

afterEach(() => {
  cleanup();
});

describe("TimePicker", () => {
  it("normalizes free typing to HH:mm on blur", () => {
    const onChange = vi.fn();
    render(<TimePicker value="" onChange={onChange} ariaLabel="Start time" />);
    const input = screen.getByLabelText("Start time");
    fireEvent.change(input, { target: { value: "930" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("09:30");
  });

  it("shows the current value", () => {
    render(<TimePicker value="14:00" onChange={vi.fn()} ariaLabel="Start time" />);
    expect(screen.getByLabelText("Start time")).toHaveValue("14:00");
  });

  it("normalizes on Enter without requiring blur", () => {
    const onChange = vi.fn();
    render(<TimePicker value="" onChange={onChange} ariaLabel="Start time" />);
    const input = screen.getByLabelText("Start time");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("09:00");
  });

  it("does not call onChange when the normalized value is unchanged", () => {
    const onChange = vi.fn();
    render(<TimePicker value="09:30" onChange={onChange} ariaLabel="Start time" />);
    const input = screen.getByLabelText("Start time");
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blanks unparseable input on blur", () => {
    const onChange = vi.fn();
    render(<TimePicker value="14:00" onChange={onChange} ariaLabel="Start time" />);
    const input = screen.getByLabelText("Start time");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("updates the draft when the value prop changes externally", () => {
    const { rerender } = render(
      <TimePicker value="09:00" onChange={vi.fn()} ariaLabel="Start time" />,
    );
    rerender(<TimePicker value="10:15" onChange={vi.fn()} ariaLabel="Start time" />);
    expect(screen.getByLabelText("Start time")).toHaveValue("10:15");
  });
});
