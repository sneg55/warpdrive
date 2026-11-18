// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("Select", () => {
  const options = [
    { value: "a", label: "Call" },
    { value: "b", label: "Meeting" },
  ];

  it("shows the selected label and emits on change", () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={options} ariaLabel="Type" />);
    const trigger = screen.getByLabelText("Type");
    expect(trigger).toHaveTextContent("Call");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Meeting" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("renders a leading icon for options that have one", () => {
    const onChange = vi.fn();
    const iconOptions = [
      { value: "a", label: "Call", icon: <span data-testid="call-icon">C</span> },
      { value: "b", label: "Meeting" },
    ];
    render(<Select value="a" onChange={onChange} options={iconOptions} ariaLabel="Type" />);
    fireEvent.click(screen.getByLabelText("Type"));
    expect(screen.getByTestId("call-icon")).toBeInTheDocument();
  });

  it("shows the empty-value option's label on the trigger, not the placeholder", () => {
    const onChange = vi.fn();
    const emptyOptions = [
      { value: "", label: "None" },
      { value: "b", label: "Meeting" },
    ];
    render(<Select value="" onChange={onChange} options={emptyOptions} ariaLabel="Type" />);
    const trigger = screen.getByLabelText("Type");
    expect(trigger).toHaveTextContent("None");
  });

  it("renders the empty-value option in the dropdown and decodes it back to onChange('')", () => {
    const onChange = vi.fn();
    const emptyOptions = [
      { value: "", label: "None" },
      { value: "b", label: "Meeting" },
    ];
    render(<Select value="b" onChange={onChange} options={emptyOptions} ariaLabel="Type" />);
    fireEvent.click(screen.getByLabelText("Type"));
    expect(screen.getByRole("option", { name: "None" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("paints the selected label in the server HTML", () => {
    const html = renderToString(
      <Select value="a" onChange={() => {}} options={options} ariaLabel="Type" />,
    );
    expect(html).toContain("Call");
  });

  it("shows the placeholder when the value is empty and no option matches it", () => {
    render(
      <Select
        value=""
        onChange={vi.fn()}
        options={options}
        ariaLabel="Type"
        placeholder="Sort by"
      />,
    );
    expect(screen.getByLabelText("Type")).toHaveTextContent("Sort by");
  });

  it("shows the placeholder when the value matches no option yet", () => {
    render(
      <Select
        value="pipeline-1"
        onChange={vi.fn()}
        options={[]}
        ariaLabel="Pipeline"
        placeholder="Select pipeline"
      />,
    );
    expect(screen.getByLabelText("Pipeline")).toHaveTextContent("Select pipeline");
  });

  it("keeps custom trigger content ahead of the placeholder", () => {
    render(
      <Select
        value=""
        onChange={vi.fn()}
        options={options}
        ariaLabel="Type"
        placeholder="Sort by"
        triggerContent={<span>Custom</span>}
      />,
    );
    const trigger = screen.getByLabelText("Type");
    expect(trigger).toHaveTextContent("Custom");
    expect(trigger).not.toHaveTextContent("Sort by");
  });

  it("does not open or report a change while disabled", () => {
    const onChange = vi.fn();
    const options = [
      { value: "a", label: "Call" },
      { value: "b", label: "Meeting" },
    ];
    render(<Select value="a" onChange={onChange} options={options} ariaLabel="Type" disabled />);

    const trigger = screen.getByLabelText("Type");
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole("option", { name: "Meeting" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
