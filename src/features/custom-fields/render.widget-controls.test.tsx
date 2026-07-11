// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import {
  DateControl,
  MultiOptionControl,
  NumericControl,
  SingleOptionControl,
  TimeControl,
} from "./render.widget-controls";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

function def(overrides: Partial<CustomFieldDef>): CustomFieldDef {
  return {
    id: "cf1",
    targetEntity: "deal",
    type: "numeric",
    name: "Count",
    key: "count",
    options: [],
    isRequired: false,
    isImportant: false,
    showInAddForm: false,
    order: 0,
    archivedAt: null,
    ...overrides,
  };
}

describe("NumericControl bounds", () => {
  it("does not commit a negative value on a monetary field", () => {
    const onChange = vi.fn();
    render(
      <NumericControl
        id="x"
        def={def({ type: "monetary", name: "Amount" })}
        value={""}
        onChange={onChange}
        step="0.01"
        min={0}
      />,
    );
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "-5" } });
    expect(onChange).not.toHaveBeenCalledWith(-5);
  });

  it("does not emit NaN when a numeric field is cleared", () => {
    const onChange = vi.fn();
    render(<NumericControl id="x" def={def({})} value={5} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "" } });
    const arg = onChange.mock.calls.at(-1)?.[0];
    expect(Number.isNaN(arg as number)).toBe(false);
  });
});

describe("DateControl", () => {
  it("renders the field labeled by the custom field name", () => {
    render(
      <DateControl
        id="d"
        def={def({ type: "date", name: "Renewal" })}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Renewal")).toBeInTheDocument();
  });

  it("emits the picked date via onChange", () => {
    const onChange = vi.fn();
    render(
      <DateControl
        id="d"
        def={def({ type: "date", name: "Renewal" })}
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Renewal"));
    fireEvent.click(screen.getByText("15"));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/-15$/));
  });

  it("clears the field via the Clear control", () => {
    const onChange = vi.fn();
    render(
      <DateControl
        id="d"
        def={def({ type: "date", name: "Renewal" })}
        value="2026-07-04"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Renewal"));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("TimeControl", () => {
  it("renders the field labeled by the custom field name", () => {
    render(
      <TimeControl
        id="t"
        def={def({ type: "time", name: "Start Time" })}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Start Time")).toBeInTheDocument();
  });

  it("emits the normalized HH:mm string via onChange", () => {
    const onChange = vi.fn();
    render(
      <TimeControl
        id="t"
        def={def({ type: "time", name: "Start Time" })}
        value=""
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Start Time");
    fireEvent.change(input, { target: { value: "930" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("09:30");
  });
});

const optionDef = (over: Partial<CustomFieldDef> = {}) =>
  def({
    type: "single_option",
    name: "Stage",
    options: [
      { id: "a", label: "Active" },
      { id: "z", label: "Retired", archived: true },
    ],
    ...over,
  });

describe("option controls hide archived options from the picker", () => {
  it("SingleOptionControl omits an archived option that is not selected", () => {
    render(<SingleOptionControl id="s" def={optionDef()} value="" onChange={vi.fn()} />);
    // The branded Select only mounts its option list once opened.
    fireEvent.click(screen.getByLabelText("Stage"));
    expect(screen.queryByRole("option", { name: "Retired" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Active" })).toBeInTheDocument();
  });

  it("SingleOptionControl still shows an archived option that is the current value", () => {
    render(<SingleOptionControl id="s" def={optionDef()} value="z" onChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Stage"));
    // Historical data must remain visible/deselectable even though the option is archived.
    expect(screen.getByRole("option", { name: "Retired" })).toBeInTheDocument();
  });

  it("MultiOptionControl omits an archived option unless it is already selected", () => {
    const { rerender } = render(
      <MultiOptionControl
        def={optionDef({ type: "multi_option" })}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
    rerender(
      <MultiOptionControl
        def={optionDef({ type: "multi_option" })}
        value={["z"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Retired")).toBeInTheDocument();
  });
});

describe("SingleOptionControl clear option", () => {
  it("offers a clear option that resets an already-set value back to empty", () => {
    const onChange = vi.fn();
    render(<SingleOptionControl id="s" def={optionDef()} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Stage"));
    fireEvent.click(screen.getByRole("option", { name: "-- select --" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
