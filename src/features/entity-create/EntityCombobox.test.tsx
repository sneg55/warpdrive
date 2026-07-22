// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityCombobox } from "./EntityCombobox";

afterEach(cleanup);

const ORGS = [
  { id: "or1", name: "Acme Inc" },
  { id: "or2", name: "Beta LLC" },
];

function renderCombobox(overrides: Partial<React.ComponentProps<typeof EntityCombobox>> = {}) {
  const onSelectExisting = vi.fn();
  const onCreateNew = vi.fn();
  const onClear = vi.fn();
  render(
    <EntityCombobox
      label="Organization"
      options={ORGS}
      createLabel={(q) => `Add '${q}' as new organization`}
      onSelectExisting={onSelectExisting}
      onCreateNew={onCreateNew}
      onClear={onClear}
      {...overrides}
    />,
  );
  return { onSelectExisting, onCreateNew, onClear };
}

describe("EntityCombobox", () => {
  it("renders a labelled text input (not a fixed dropdown)", () => {
    renderCombobox();
    const input = screen.getByLabelText("Organization");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("stays closed when the input is only focused (e.g. modal autofocus on mount)", () => {
    renderCombobox();
    fireEvent.focus(screen.getByLabelText("Organization"));
    // Programmatic focus must not spill the whole option list open before the user interacts.
    expect(screen.queryByText("Acme Inc")).toBeNull();
    expect(screen.queryByText("Beta LLC")).toBeNull();
  });

  it("opens the option list when the user clicks the input", () => {
    renderCombobox();
    fireEvent.click(screen.getByLabelText("Organization"));
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText("Beta LLC")).toBeInTheDocument();
  });

  it("filters existing options by the typed query", () => {
    renderCombobox();
    fireEvent.focus(screen.getByLabelText("Organization"));
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "ac" } });
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.queryByText("Beta LLC")).toBeNull();
  });

  it("offers a create-new row for a query that matches no existing option", () => {
    renderCombobox();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "test" } });
    expect(screen.getByText(/Add 'test' as new organization/)).toBeInTheDocument();
  });

  it("does not offer create-new when the query exactly matches an existing option", () => {
    renderCombobox();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Acme Inc" } });
    expect(screen.queryByText(/as new organization/)).toBeNull();
  });

  it("selects an existing option by its id", () => {
    const { onSelectExisting } = renderCombobox();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "beta" } });
    fireEvent.mouseDown(screen.getByText("Beta LLC"));
    expect(onSelectExisting).toHaveBeenCalledWith("or2");
  });

  it("creates a new entity with the trimmed query and shows a NEW badge", () => {
    const { onCreateNew } = renderCombobox();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "  test  " } });
    fireEvent.mouseDown(screen.getByText(/Add 'test' as new organization/));
    expect(onCreateNew).toHaveBeenCalledWith("test");
    expect(screen.getByText("NEW")).toBeInTheDocument();
  });

  it("clears the selection when the input is emptied", () => {
    const { onClear } = renderCombobox();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "" } });
    expect(onClear).toHaveBeenCalled();
  });

  it("commits a typed name as create-new on blur when no menu row is clicked", () => {
    const { onCreateNew } = renderCombobox();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Globex" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    expect(onCreateNew).toHaveBeenCalledWith("Globex");
  });

  it("selects an exact existing match on blur instead of creating a duplicate", () => {
    const { onSelectExisting, onCreateNew } = renderCombobox();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "acme inc" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    expect(onSelectExisting).toHaveBeenCalledWith("or1");
    expect(onCreateNew).not.toHaveBeenCalled();
  });

  it("re-reconciles a committed selection that was edited before blur", () => {
    const { onSelectExisting, onCreateNew } = renderCombobox();
    // Pick an existing option, then edit the text to something new and blur without re-picking.
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "beta" } });
    fireEvent.mouseDown(screen.getByText("Beta LLC"));
    expect(onSelectExisting).toHaveBeenLastCalledWith("or2");
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Beta Global" } });
    fireEvent.blur(screen.getByLabelText("Organization"));
    expect(onCreateNew).toHaveBeenCalledWith("Beta Global");
  });

  it("clears on blur when the field is empty", () => {
    const { onClear } = renderCombobox();
    fireEvent.focus(screen.getByLabelText("Organization"));
    fireEvent.blur(screen.getByLabelText("Organization"));
    expect(onClear).toHaveBeenCalled();
  });

  it("warns after creating a new entity that resembles an existing one", () => {
    renderCombobox({
      options: [{ id: "or3", name: "test org" }],
      similarWarning: "Similar organization already exists.",
    });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "test" } });
    fireEvent.mouseDown(screen.getByText(/Add 'test' as new organization/));
    expect(screen.getByText("Similar organization already exists.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
  });

  it("reopens the dropdown with the similar matches when Review is clicked", () => {
    renderCombobox({
      options: [{ id: "or3", name: "test org" }],
      similarWarning: "Similar organization already exists.",
    });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "test" } });
    fireEvent.mouseDown(screen.getByText(/Add 'test' as new organization/));
    expect(screen.queryByText("test org")).toBeNull(); // menu closed after create
    fireEvent.mouseDown(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("test org")).toBeInTheDocument();
  });

  it("Review lists a similar option even when it is not a substring of the typed name", () => {
    const { onSelectExisting } = renderCombobox({
      options: [{ id: "or1", name: "Acme Inc" }],
      similarWarning: "Similar organization already exists.",
    });
    // "Acme Global" shares the first word with "Acme Inc" but neither contains the other.
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Acme Global" } });
    fireEvent.mouseDown(screen.getByText(/Add 'Acme Global' as new organization/));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Review" }));
    fireEvent.mouseDown(screen.getByText("Acme Inc"));
    expect(onSelectExisting).toHaveBeenCalledWith("or1");
  });

  it("does not warn when the new name resembles nothing existing", () => {
    renderCombobox({
      options: [{ id: "or3", name: "test org" }],
      similarWarning: "Similar organization already exists.",
    });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Globex" } });
    fireEvent.mouseDown(screen.getByText(/Add 'Globex' as new organization/));
    expect(screen.queryByText("Similar organization already exists.")).toBeNull();
  });
});
