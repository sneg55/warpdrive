// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DATE_PRESET_LABELS } from "@/constants/dateFilterPresets";
import { ConditionValue } from "./ConditionValue";

afterEach(cleanup);

function renderDate(value: string) {
  const onChange = vi.fn();
  const utils = render(
    <ConditionValue
      input={{ kind: "date" }}
      ariaLabel="Condition 1 value"
      value={value}
      onChange={onChange}
    />,
  );
  return { ...utils, onChange };
}

describe("ConditionValue for a date field", () => {
  it("starts on an exact date with the picker beside the period select", () => {
    renderDate("");
    expect(screen.getByLabelText("Condition 1 value period")).toHaveTextContent("Exact date");
    expect(screen.getByLabelText("Condition 1 value").tagName).toBe("BUTTON");
  });

  it("shows a stored preset by its label and hides the date picker", () => {
    renderDate("last_week");
    expect(screen.getByLabelText("Condition 1 value period")).toHaveTextContent(
      DATE_PRESET_LABELS.last_week,
    );
    expect(screen.queryByLabelText("Condition 1 value")).toBeNull();
  });

  it("picking a period stores its key as the row value", () => {
    const { onChange } = renderDate("2026-09-02");
    fireEvent.click(screen.getByLabelText("Condition 1 value period"));
    fireEvent.click(screen.getByRole("option", { name: DATE_PRESET_LABELS.this_month }));
    expect(onChange).toHaveBeenCalledWith("this_month");
  });

  it("switching back to an exact date clears the preset so the row waits for a date", () => {
    const { onChange } = renderDate("today");
    fireEvent.click(screen.getByLabelText("Condition 1 value period"));
    fireEvent.click(screen.getByRole("option", { name: "Exact date" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("never renders a native select or date input", () => {
    const { container } = renderDate("today");
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });
});
