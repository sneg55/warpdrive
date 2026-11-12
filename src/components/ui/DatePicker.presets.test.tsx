// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RANGE_PRESET_LABELS } from "@/constants/rangePresets";
import { DatePicker } from "./DatePicker";
import { resolveRangePreset } from "./rangePresets";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("DatePicker range presets", () => {
  it("sets the whole range from a preset and closes", () => {
    const onPresetRange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <DatePicker
        value="2026-07-04"
        onChange={vi.fn()}
        ariaLabel="Start date"
        onPresetRange={onPresetRange}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Start date"));
    fireEvent.click(screen.getByRole("button", { name: RANGE_PRESET_LABELS.last_month }));
    expect(onPresetRange).toHaveBeenCalledWith(resolveRangePreset("last_month", new Date()));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("lists every preset when the caller takes ranges", () => {
    render(
      <DatePicker
        value="2026-07-04"
        onChange={vi.fn()}
        ariaLabel="Start date"
        onPresetRange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Start date"));
    for (const label of Object.values(RANGE_PRESET_LABELS)) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("shows no presets for a single-date picker", () => {
    render(<DatePicker value="2026-07-04" onChange={vi.fn()} ariaLabel="Start date" />);
    fireEvent.click(screen.getByLabelText("Start date"));
    expect(screen.queryByRole("button", { name: RANGE_PRESET_LABELS.this_week })).toBeNull();
  });
});
