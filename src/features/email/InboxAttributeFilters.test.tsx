// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { InboxAttributeFilters } from "./InboxAttributeFilters";
import { type AttributeFilterState, NO_ATTRIBUTE_FILTER } from "./threadAttributeFilter";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

afterEach(cleanup);

const noop = (): void => {};

describe("InboxAttributeFilters", () => {
  it("renders a follow-up and a label filter", () => {
    render(<InboxAttributeFilters value={NO_ATTRIBUTE_FILTER} onChange={noop} />);
    expect(screen.getByLabelText("Follow-up status filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Label filter")).toBeInTheDocument();
  });

  it("reflects the selected follow-up status", () => {
    render(
      <InboxAttributeFilters
        value={{ ...NO_ATTRIBUTE_FILTER, followUp: "waiting" }}
        onChange={noop}
      />,
    );
    expect(screen.getByLabelText("Follow-up status filter")).toHaveTextContent("Waiting");
  });

  it("reflects the selected label", () => {
    render(
      <InboxAttributeFilters value={{ ...NO_ATTRIBUTE_FILTER, label: "to_do" }} onChange={noop} />,
    );
    expect(screen.getByLabelText("Label filter")).toHaveTextContent("To do");
  });

  it("renders the quick-filter controls", () => {
    render(<InboxAttributeFilters value={NO_ATTRIBUTE_FILTER} onChange={noop} />);
    expect(screen.getByLabelText("Has attachment")).toBeInTheDocument();
    expect(screen.getByLabelText("Unread only")).toBeInTheDocument();
    expect(screen.getByLabelText("Date range")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("toggling Has attachment calls onChange with hasAttachment true", () => {
    const onChange = vi.fn<(next: AttributeFilterState) => void>();
    render(<InboxAttributeFilters value={NO_ATTRIBUTE_FILTER} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Has attachment"));
    expect(onChange).toHaveBeenCalledWith({ ...NO_ATTRIBUTE_FILTER, hasAttachment: true });
  });

  it("toggling Unread only calls onChange with unreadOnly true", () => {
    const onChange = vi.fn<(next: AttributeFilterState) => void>();
    render(<InboxAttributeFilters value={NO_ATTRIBUTE_FILTER} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Unread only"));
    expect(onChange).toHaveBeenCalledWith({ ...NO_ATTRIBUTE_FILTER, unreadOnly: true });
  });

  it("reflects the selected date range", () => {
    render(
      <InboxAttributeFilters value={{ ...NO_ATTRIBUTE_FILTER, dateRange: "7d" }} onChange={noop} />,
    );
    expect(screen.getByLabelText("Date range")).toHaveTextContent("Last 7 days");
  });

  it("Clear resets to NO_ATTRIBUTE_FILTER", () => {
    const onChange = vi.fn<(next: AttributeFilterState) => void>();
    render(
      <InboxAttributeFilters
        value={{ ...NO_ATTRIBUTE_FILTER, hasAttachment: true, unreadOnly: true, dateRange: "30d" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(NO_ATTRIBUTE_FILTER);
  });
});
