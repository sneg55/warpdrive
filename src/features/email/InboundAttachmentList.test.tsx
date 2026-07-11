// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InboundAttachmentList } from "./InboundAttachmentList";

afterEach(cleanup);

describe("InboundAttachmentList", () => {
  it("renders a download link per attachment with filename + humanized size", () => {
    render(
      <InboundAttachmentList
        attachments={[
          { id: "at1", filename: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 88190 },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /invoice\.pdf/ });
    expect(link).toHaveAttribute("href", "/api/email/attachments/at1");
    expect(link).toHaveAttribute("download");
    expect(screen.getByText(/86 KB/)).toBeInTheDocument();
  });

  it("renders multiple attachments, each with its own link", () => {
    render(
      <InboundAttachmentList
        attachments={[
          { id: "at1", filename: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 88190 },
          { id: "at2", filename: "logo.png", mimeType: "image/png", sizeBytes: 512 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /invoice\.pdf/ })).toHaveAttribute(
      "href",
      "/api/email/attachments/at1",
    );
    expect(screen.getByRole("link", { name: /logo\.png/ })).toHaveAttribute(
      "href",
      "/api/email/attachments/at2",
    );
    expect(screen.getByText(/512 B/)).toBeInTheDocument();
  });

  it("renders nothing when there are no attachments", () => {
    const { container } = render(<InboundAttachmentList attachments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
