// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(cleanup);

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { templates: { list: { invalidate: () => undefined } } } }),
    email: {
      templates: {
        list: {
          useQuery: () => ({ data: [{ id: "t1", name: "Follow Up", subject: "Following up" }] }),
        },
        get: {
          useQuery: (_input: unknown, opts: { enabled?: boolean } = {}) =>
            opts.enabled === false
              ? { data: undefined }
              : {
                  data: {
                    id: "t1",
                    name: "Follow Up",
                    subject: "Following up",
                    bodyHtml: "<p>Just following up</p>",
                  },
                },
        },
      },
      mergeContext: { useQuery: () => ({ data: {}, isPending: false }) },
      signatures: { list: { useQuery: () => ({ data: [] }) } },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
    activities: {
      listTypes: { useQuery: () => ({ data: [] }) },
    },
  },
}));

vi.mock("@/features/email/actions", () => ({
  sendEmail: () => Promise.resolve({ ok: true }),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

vi.mock("../folderActions", () => ({
  saveDraftAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "draft-stub" } })),
  deleteDraftAction: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("@/features/activities/actions", () => ({
  createActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
  completeActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
}));

vi.mock("@/features/files/serverActions", () => ({
  requestUploadAction: () =>
    Promise.resolve({
      ok: true,
      value: { fileId: "attach-file-1", post: { url: "https://fake/up", fields: {} } },
    }),
  confirmUploadAction: () => Promise.resolve({ ok: true }),
}));

vi.mock("./SaveAsTemplateDialog", () => ({
  SaveAsTemplateDialog: () => null,
}));

vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 204 })));

import { Composer } from "./Composer";

function pickTemplate(): void {
  fireEvent.click(screen.getByLabelText(/choose template/i));
  fireEvent.click(screen.getByRole("option", { name: "Follow Up" }));
}

const REPLY_PREFILL = { to: ["ann@acme.com"], cc: [], subject: "Re: Proposal", bodyHtml: "" };

describe("Composer: a template applied to a reply", () => {
  it("keeps the Re: subject so Gmail threads the reply, while the body still applies", async () => {
    render(
      <Composer
        accountId="a1"
        context={{ kind: "inbox" }}
        threadId="th1"
        prefill={REPLY_PREFILL}
      />,
    );
    pickTemplate();
    expect(await screen.findByText("Just following up")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Subject")).toHaveValue("Re: Proposal");
  });

  it("still takes the template subject on a fresh compose", async () => {
    render(<Composer accountId="a1" context={{ kind: "inbox" }} />);
    pickTemplate();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Subject")).toHaveValue("Following up");
    });
  });
});
