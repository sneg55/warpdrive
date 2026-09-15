// @vitest-environment jsdom
// src/components/ui/Combobox.test.tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Combobox } from "./Combobox";
import { Tip } from "./tooltip";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk observes its list's size to manage height; jsdom has no ResizeObserver.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(() => {
  cleanup();
});

describe("Combobox", () => {
  const options = [
    { value: "u1", label: "Ann Owner", avatarName: "Ann Owner" },
    { value: "u2", label: "Bob Rep", avatarName: "Bob Rep" },
  ];

  it("filters by type-ahead and emits the picked value", () => {
    const onChange = vi.fn();
    render(<Combobox value="u1" onChange={onChange} options={options} ariaLabel="Owner" />);
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "Bob" } });
    // Prove the type-ahead actually narrows the option list to the single
    // match (not just that an already-visible row is clickable). Ann Owner
    // still shows in the trigger since it is the current value, so assert on
    // the option role, which is list-scoped.
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Bob Rep");
    fireEvent.click(screen.getByText("Bob Rep"));
    expect(onChange).toHaveBeenCalledWith("u2");
  });

  it("shows the selected option's avatar in the trigger", () => {
    const onChange = vi.fn();
    render(<Combobox value="u2" onChange={onChange} options={options} ariaLabel="Owner" />);
    const trigger = screen.getByLabelText("Owner");
    expect(trigger).toHaveTextContent("Bob Rep");
    expect(screen.getByRole("img", { name: "Bob Rep" })).toBeInTheDocument();
  });

  it("does not open when disabled", () => {
    const onChange = vi.fn();
    render(
      <Combobox value="u1" onChange={onChange} options={options} ariaLabel="Owner" disabled />,
    );
    const trigger = screen.getByLabelText("Owner");
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByPlaceholderText("Search...")).toBeNull();
  });

  it("renders a heading above each group of options", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        value="u1"
        onChange={onChange}
        ariaLabel="Owner"
        options={[
          { value: "u1", label: "Ann Owner", group: "People" },
          { value: "t1", label: "West Coast", group: "Teams" },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Owner"));
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Teams")).toBeInTheDocument();
    fireEvent.click(screen.getByText("West Coast"));
    expect(onChange).toHaveBeenCalledWith("t1");
  });

  it("keeps two options with the same label distinguishable", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        value=""
        onChange={onChange}
        ariaLabel="Owner"
        options={[
          { value: "u9", label: "West Coast", group: "People" },
          { value: "t9", label: "West Coast", group: "Teams" },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Owner"));
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.click(screen.getAllByText("West Coast")[1]!);
    expect(onChange).toHaveBeenCalledWith("t9");
  });

  it("selects the keyboard-highlighted option when two labels collide", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        value=""
        onChange={onChange}
        ariaLabel="Owner"
        options={[
          { value: "t9", label: "West Coast", group: "Teams" },
          { value: "u9", label: "West Coast", group: "People" },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "West" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(screen.getByPlaceholderText("Search..."), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByPlaceholderText("Search..."), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("u9");
  });

  it("shows a wrapping tooltip's hint when the trigger takes focus", async () => {
    const onChange = vi.fn();
    render(
      <Tip label="Whose numbers to show">
        <Combobox value="u1" onChange={onChange} options={options} ariaLabel="Owner" />
      </Tip>,
    );
    fireEvent.focus(screen.getByLabelText("Owner"));
    expect(await screen.findAllByText("Whose numbers to show")).not.toHaveLength(0);
  });

  it("narrows on the label, not on the option's opaque value", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        value=""
        onChange={onChange}
        ariaLabel="Owner"
        options={[
          { value: "user:717e2e90-e14e-4f6c-834a-066707668532", label: "Demo Rep Esra" },
          { value: "user:94f8b214-e538-434f-aff9-4126f1fad387", label: "Demo Rep Diego" },
          { value: "team:e09006a7-2365-40d5-8937-1cde735b5266", label: "West Coast" },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "esra" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Demo Rep Esra");
  });
});
