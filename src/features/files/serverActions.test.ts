// @vitest-environment node
// The file-upload/download handshake was the only server-action family with no CSRF guard. It
// authenticated (ctx.actor) and authorized (the domain functions), so it was never an auth bypass,
// but a cross-site page could still drive the handshake on a logged-in user's behalf. Every other
// mutation family runs guardCsrf first; these now do too.
//
// Mirrors contacts/actions.test.ts: next/headers + context mocked so guardCsrf runs exactly as in
// production, while the domain layer is spied so no storage or DB is touched. The point is that a
// forged request is rejected BEFORE any domain call.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CSRF_COOKIE } from "@/features/auth/csrf";

const headerStore = new Map<string, string>();
const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }),
  cookies: () =>
    Promise.resolve({
      get: (k: string) => {
        const value = cookieStore.get(k);
        return value === undefined ? undefined : { value };
      },
    }),
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn().mockResolvedValue({
    actor: { id: "user-1", type: "regular", isActive: true, groupIds: new Set<string>() },
    session: null,
    db: {},
  }),
}));

const { requestUpload, confirmUpload, requestDownload } = vi.hoisted(() => ({
  requestUpload: vi.fn(() => Promise.resolve({ ok: true as const, value: { fileId: "f1" } })),
  confirmUpload: vi.fn(() => Promise.resolve({ ok: true as const, value: { status: "ready" } })),
  requestDownload: vi.fn(() => Promise.resolve({ ok: true as const, value: { url: "u" } })),
}));
vi.mock("./actions", () => ({ requestUpload, confirmUpload, requestDownload }));
vi.mock("./storage", () => ({ makeStorageClient: () => ({}) }));

import { confirmUploadAction, requestDownloadAction, requestUploadAction } from "./serverActions";

const VALID_TOKEN = "csrf-test-token";

function setSameOrigin(): void {
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("host", "app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
  cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
}

const uploadInput = {
  entityType: "deal" as const,
  entityId: "00000000-0000-0000-0000-000000000001",
  filename: "a.pdf",
  contentType: "application/pdf" as const,
  size: 10,
};

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
  vi.clearAllMocks();
});

describe("file server actions reject a request with no valid CSRF token", () => {
  test("requestUploadAction refuses a forged token without minting a presigned post", async () => {
    setSameOrigin();
    const r = await requestUploadAction("wrong-token", uploadInput);
    expect(r.ok).toBe(false);
    expect(requestUpload).not.toHaveBeenCalled();
  });

  test("confirmUploadAction refuses a forged token without confirming the file", async () => {
    setSameOrigin();
    const r = await confirmUploadAction("wrong-token", "f1");
    expect(r.ok).toBe(false);
    expect(confirmUpload).not.toHaveBeenCalled();
  });

  test("requestDownloadAction refuses a forged token without minting a download url", async () => {
    setSameOrigin();
    const r = await requestDownloadAction("wrong-token", "f1");
    expect(r.ok).toBe(false);
    expect(requestDownload).not.toHaveBeenCalled();
  });
});

describe("file server actions still work for a same-origin request with the right token", () => {
  test("requestUploadAction reaches the domain layer", async () => {
    setSameOrigin();
    const r = await requestUploadAction(VALID_TOKEN, uploadInput);
    expect(r.ok).toBe(true);
    expect(requestUpload).toHaveBeenCalledTimes(1);
  });

  test("requestDownloadAction reaches the domain layer", async () => {
    setSameOrigin();
    const r = await requestDownloadAction(VALID_TOKEN, "f1");
    expect(r.ok).toBe(true);
    expect(requestDownload).toHaveBeenCalledTimes(1);
  });
});
