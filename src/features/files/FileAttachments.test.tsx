// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

afterEach(cleanup);

const refetch = vi.fn(() => Promise.resolve());
const useQuery = vi.fn(() => ({
  data: [{ id: "f1", filename: "report.pdf", sizeBytes: 2048, contentType: "application/pdf" }],
  refetch,
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { files: { listForEntity: { useQuery: () => useQuery() } } },
}));

const requestUploadAction = vi.fn<(csrfToken: string | null, input: unknown) => Promise<unknown>>(
  () =>
    Promise.resolve({
      ok: true as const,
      value: { fileId: "new-file", post: { url: "https://s3.local/upload", fields: { key: "k" } } },
    }),
);
const confirmUploadAction = vi.fn<(csrfToken: string | null, fileId: string) => Promise<unknown>>(
  () => Promise.resolve({ ok: true as const, value: { status: "ready" as const } }),
);
const requestDownloadAction = vi.fn<(csrfToken: string | null, fileId: string) => Promise<unknown>>(
  () => Promise.resolve({ ok: true as const, value: { url: "https://s3.local/download" } }),
);
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("./serverActions", () => ({
  requestUploadAction: (csrfToken: string | null, input: unknown) =>
    requestUploadAction(csrfToken, input),
  confirmUploadAction: (csrfToken: string | null, fileId: string) =>
    confirmUploadAction(csrfToken, fileId),
  requestDownloadAction: (csrfToken: string | null, fileId: string) =>
    requestDownloadAction(csrfToken, fileId),
}));

import { FileAttachments } from "./FileAttachments";

beforeEach(() => {
  refetch.mockClear();
  requestUploadAction.mockClear();
  confirmUploadAction.mockClear();
  requestDownloadAction.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true } as Response)),
  );
});

it("renders the confirmed files from the query", () => {
  render(<FileAttachments entityType="deal" entityId="d1" />);
  expect(screen.getByText("report.pdf")).toBeInTheDocument();
});

it("hides the upload control in readOnly mode but keeps the list + download", () => {
  render(<FileAttachments entityType="deal" entityId="d1" readOnly />);
  // The confirmed file list and its download affordance still render.
  expect(screen.getByRole("button", { name: "Download report.pdf" })).toBeInTheDocument();
  // But there is no uploader: neither the button nor the hidden file input.
  expect(screen.queryByLabelText("Upload file")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Upload file" })).not.toBeInTheDocument();
});

it("runs request -> upload -> confirm then refetches on file select", async () => {
  render(<FileAttachments entityType="deal" entityId="d1" />);
  const file = new File(["hello"], "note.txt", { type: "text/plain" });
  const input = screen.getByLabelText("Upload file");
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(requestUploadAction).toHaveBeenCalledTimes(1));
  expect(requestUploadAction.mock.calls[0]?.[1]).toMatchObject({
    entityType: "deal",
    entityId: "d1",
    filename: "note.txt",
    contentType: "text/plain",
  });
  await waitFor(() => expect(confirmUploadAction).toHaveBeenCalledWith("csrf", "new-file"));
  await waitFor(() => expect(refetch).toHaveBeenCalled());
});

it("rejects an oversized file without calling the server", async () => {
  render(<FileAttachments entityType="deal" entityId="d1" />);
  const big = new File([""], "big.txt", { type: "text/plain" });
  Object.defineProperty(big, "size", { value: 999_999_999 });
  fireEvent.change(screen.getByLabelText("Upload file"), { target: { files: [big] } });

  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(requestUploadAction).not.toHaveBeenCalled();
});

it("mints a presigned download URL on demand when a file is downloaded", async () => {
  const open = vi.fn();
  vi.stubGlobal("open", open);
  render(<FileAttachments entityType="deal" entityId="d1" />);
  fireEvent.click(screen.getByRole("button", { name: "Download report.pdf" }));
  await waitFor(() => expect(requestDownloadAction).toHaveBeenCalledWith("csrf", "f1"));
});

it("downloads via an anchor click, not window.open (which popup blockers suppress after an await)", async () => {
  const open = vi.fn();
  vi.stubGlobal("open", open);
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<FileAttachments entityType="deal" entityId="d1" />);
  fireEvent.click(screen.getByRole("button", { name: "Download report.pdf" }));
  await waitFor(() => expect(click).toHaveBeenCalled());
  expect(open).not.toHaveBeenCalled();
  click.mockRestore();
});

it("still refetches after a partial-batch failure so confirmed uploads are not hidden", async () => {
  // File 1 uploads fine, file 2's POST fails: the already-confirmed file 1 must still surface.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false }),
  );
  render(<FileAttachments entityType="deal" entityId="d1" />);
  const f1 = new File(["a"], "one.txt", { type: "text/plain" });
  const f2 = new File(["b"], "two.txt", { type: "text/plain" });
  fireEvent.change(screen.getByLabelText("Upload file"), { target: { files: [f1, f2] } });
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  await waitFor(() => expect(refetch).toHaveBeenCalled());
});

it("surfaces an error when the upload fetch rejects (network drop) instead of failing silently", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network"))),
  );
  render(<FileAttachments entityType="deal" entityId="d1" />);
  const file = new File(["x"], "note.txt", { type: "text/plain" });
  fireEvent.change(screen.getByLabelText("Upload file"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});
