// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// Stub server actions used by AttachButton.
const requestUploadMock = vi.fn<
  () => Promise<{
    ok: boolean;
    value?: { fileId: string; post: { url: string; fields: Record<string, string> } };
  }>
>(() =>
  Promise.resolve({
    ok: true,
    value: {
      fileId: "file-uuid-1",
      post: { url: "https://fake-storage.local/upload", fields: { key: "obj-key" } },
    },
  }),
);
const confirmUploadMock = vi.fn<() => Promise<{ ok: boolean }>>(() =>
  Promise.resolve({ ok: true }),
);

vi.mock("@/features/files/serverActions", () => ({
  requestUploadAction: () => requestUploadMock(),
  confirmUploadAction: () => confirmUploadMock(),
}));

// Stub global fetch so the fake presigned POST doesn't hit the network.
const fetchMock = vi.fn<() => Promise<Response>>(() =>
  Promise.resolve(new Response(null, { status: 204 })),
);
vi.stubGlobal("fetch", fetchMock);

import { AttachButton } from "./AttachButton";

describe("AttachButton", () => {
  it("renders a paperclip button", () => {
    render(<AttachButton entityType="deal" entityId="deal-1" onAttached={vi.fn()} />);
    expect(screen.getByRole("button", { name: /attach file/i })).toBeInTheDocument();
  });

  it("selecting a file calls requestUpload, POSTs to presigned URL, calls confirmUpload, and fires onAttached", async () => {
    const onAttached = vi.fn();
    requestUploadMock.mockResolvedValueOnce({
      ok: true,
      value: {
        fileId: "file-uuid-2",
        post: { url: "https://fake-storage.local/upload", fields: { key: "k" } },
      },
    });
    confirmUploadMock.mockResolvedValueOnce({ ok: true });

    render(<AttachButton entityType="deal" entityId="deal-1" onAttached={onAttached} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Simulate file selection with a PDF file.
    const file = new File(["pdf-content"], "report.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(onAttached).toHaveBeenCalledTimes(1));
    expect(onAttached).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-uuid-2", filename: "report.pdf" }),
    );
    expect(requestUploadMock).toHaveBeenCalledTimes(1);
    expect(confirmUploadMock).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when a file exceeds MAX_FILE_BYTES", async () => {
    const onAttached = vi.fn();
    render(<AttachButton entityType="deal" entityId="deal-1" onAttached={onAttached} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Create a file that is 1 byte over the limit (MAX_FILE_BYTES from schemas).
    // We use a size override since we can't really allocate that many bytes.
    const bigFile = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(bigFile, "size", { value: 50 * 1024 * 1024 + 1 });
    Object.defineProperty(input, "files", { value: [bigFile], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onAttached).not.toHaveBeenCalled();
  });

  it("shows an error when requestUpload fails", async () => {
    requestUploadMock.mockResolvedValueOnce({ ok: false });
    const onAttached = vi.fn();
    render(<AttachButton entityType="deal" entityId="deal-1" onAttached={onAttached} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onAttached).not.toHaveBeenCalled();
  });
});
