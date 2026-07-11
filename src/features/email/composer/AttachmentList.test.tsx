// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { AttachmentList } from "./AttachmentList";

const FILES = [
  { fileId: "f1", filename: "invoice.pdf", size: 12345 },
  { fileId: "f2", filename: "photo.png", size: 98765 },
];

describe("AttachmentList", () => {
  it("renders nothing when list is empty", () => {
    const { container } = render(<AttachmentList attachments={[]} onRemove={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a row for each attachment with filename", () => {
    render(<AttachmentList attachments={FILES} onRemove={vi.fn()} />);
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("calls onRemove with the fileId when the remove button is clicked", () => {
    const onRemove = vi.fn();
    render(<AttachmentList attachments={FILES} onRemove={onRemove} />);
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]!);
    expect(onRemove).toHaveBeenCalledWith("f1");
  });
});
