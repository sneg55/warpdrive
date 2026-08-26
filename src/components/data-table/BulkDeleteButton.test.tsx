// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkDeleteButton } from "./BulkDeleteButton";

afterEach(cleanup);

describe("BulkDeleteButton", () => {
  it("deletes nothing until the delete is confirmed", () => {
    const onConfirm = vi.fn();
    render(<BulkDeleteButton count={4} noun="person" nounPlural="people" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("names how many records are about to go", () => {
    render(<BulkDeleteButton count={4} noun="person" nounPlural="people" onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("4 people");
  });

  it("uses the singular noun for a single record", () => {
    render(<BulkDeleteButton count={1} noun="person" nounPlural="people" onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("1 person");
  });

  it("deletes nothing when the confirmation is cancelled", () => {
    const onConfirm = vi.fn();
    render(<BulkDeleteButton count={2} noun="person" nounPlural="people" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("deletes once confirmed", () => {
    const onConfirm = vi.fn();
    render(<BulkDeleteButton count={2} noun="person" nounPlural="people" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete people" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
