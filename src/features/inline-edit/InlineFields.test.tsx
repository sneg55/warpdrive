// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/types/result";
import { InlineDateField } from "./InlineDateField";
import { InlineSelectField } from "./InlineSelectField";
import { InlineTextField } from "./InlineTextField";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("InlineTextField (PD mechanism)", () => {
  it("renders the value as plain text with a pencil-only edit trigger", () => {
    render(<InlineTextField label="Value" value="10" onSave={vi.fn()} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    // The value is NOT a click target; clicking it must not open the editor.
    fireEvent.click(screen.getByText("10"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Value" })).toBeInTheDocument();
  });

  it("pencil click opens the editor with a dirty-gated Save footer", () => {
    render(<InlineTextField label="Value" value="10" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    expect(screen.getByLabelText("Value")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("Save commits the draft; Cancel discards it", async () => {
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    render(<InlineTextField label="Value" value="10" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("20");
    // Let the in-flight save settle (pending disables the editor controls) before re-editing.
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("neither Escape nor blur closes or commits (PD: only Cancel/Save exit)", () => {
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    render(<InlineTextField label="Value" value="10" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    const input = screen.getByLabelText("Value");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByLabelText("Value")).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.getByLabelText("Value")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Enter commits when dirty", () => {
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    render(<InlineTextField label="Value" value="10" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    const input = screen.getByLabelText("Value");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("20");
  });

  it("shows an inline error when the save fails", async () => {
    const onSave = vi.fn(() => Promise.resolve(err("E_DEAL_002")));
    render(<InlineTextField label="Value" value="10" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/couldn.t save/i)).toBeInTheDocument();
  });

  it("empty value renders the blue prompt and clicking it opens the editor directly", () => {
    render(<InlineTextField label="Website" value="" onSave={vi.fn()} placeholder="+ Add" />);
    const prompt = screen.getByRole("button", { name: "+ Add" });
    expect(prompt).toHaveClass("text-link");
    fireEvent.click(prompt);
    expect(screen.getByLabelText("Website")).toBeInTheDocument();
  });
});

describe("InlineSelectField (PD mechanism)", () => {
  const options = [
    { value: "a", label: "10%" },
    { value: "b", label: "20%" },
  ];

  it("renders the selected label as plain text with a pencil-only trigger", () => {
    render(<InlineSelectField label="Probability" value="a" options={options} onSave={vi.fn()} />);
    expect(screen.getByText("10%")).toBeInTheDocument();
    fireEvent.click(screen.getByText("10%"));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Probability" })).toBeInTheDocument();
  });

  it("picking an option does NOT autosave; Save commits it", () => {
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    render(<InlineSelectField label="Probability" value="a" options={options} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Probability" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Probability"));
    fireEvent.click(screen.getByText("20%"));
    expect(onSave).not.toHaveBeenCalled();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith("b");
  });

  it("Cancel discards the picked option", () => {
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    render(<InlineSelectField label="Probability" value="a" options={options} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Probability" }));
    fireEvent.click(screen.getByLabelText("Probability"));
    fireEvent.click(screen.getByText("20%"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });
});

describe("InlineDateField (PD mechanism)", () => {
  it("renders the date as plain text with a pencil-only trigger", () => {
    render(<InlineDateField label="Expected close date" value="2026-07-04" onSave={vi.fn()} />);
    expect(screen.getByText("07/04/2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Expected close date" })).toBeInTheDocument();
  });

  it("picking a day does NOT autosave; Save commits it", async () => {
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    render(<InlineDateField label="Expected close date" value="2026-07-04" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Expected close date" }));
    // Editor opens with the calendar already showing (PD behavior).
    fireEvent.click(await screen.findByText("15"));
    expect(onSave).not.toHaveBeenCalled();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith("2026-07-15");
  });

  it("Cancel discards the picked day", async () => {
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    render(<InlineDateField label="Expected close date" value="2026-07-04" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Expected close date" }));
    fireEvent.click(await screen.findByText("15"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("07/04/2026")).toBeInTheDocument();
  });
});
