// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { EditableActivity } from "@/features/activities/getForEdit";

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { createActivityAction, editActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const })),
  editActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "act-1" } })),
}));
vi.mock("@/features/activities/actions", () => ({ createActivityAction, editActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/email/composer/RichTextBodyLazy", () => ({
  RichTextBody: ({ onChange }: { onChange: (h: string) => void }) => (
    <textarea aria-label="Note" onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    activities: {
      listTypes: {
        useQuery: () => ({
          data: [
            { id: "t1", key: "call", name: "Call" },
            { id: "t2", key: "meeting", name: "Meeting" },
          ],
        }),
      },
      availability: { useQuery: () => ({ data: { busy: false } }) },
    },
    identity: { assignableUsers: { useQuery: () => ({ data: [{ id: "u1", name: "Me" }] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [{ id: "p1", name: "Ann" }] }) } },
  },
}));

import { ActivityComposerInline } from "./ActivityComposerInline";

function editing(): EditableActivity {
  return {
    id: "act-1",
    typeId: "t2",
    subject: "Existing sync",
    priority: null,
    dueAt: "2026-08-01T14:00:00.000Z",
    endAt: null,
    durationMinutes: null,
    location: "HQ",
    note: null,
    videoCallUrl: "https://call.example.com/x",
    assigneeId: "u1",
    done: false,
    dealId: "d1",
    personId: null,
    orgId: "o1",
    guestPersonIds: ["p1"],
    participantUserIds: [],
  };
}

it("prefills the composer from the activity being edited", () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId={null}
      orgId="o1"
      onCreated={vi.fn()}
      editing={editing()}
    />,
  );
  expect(screen.getByLabelText("Subject")).toHaveValue("Existing sync");
  expect(screen.getByLabelText("Location")).toHaveValue("HQ");
});

it("saves via editActivityAction (not create) with the activity id and edited fields", async () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId={null}
      orgId="o1"
      onCreated={vi.fn()}
      editing={editing()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Renamed sync" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(editActivityAction).toHaveBeenCalled());
  expect(createActivityAction).not.toHaveBeenCalled();
  const [patch] = editActivityAction.mock.calls[0] as unknown as [Record<string, unknown>, string];
  expect(patch.id).toBe("act-1");
  expect(patch.subject).toBe("Renamed sync");
  expect(patch.videoCallUrl).toBe("https://call.example.com/x");
  expect(patch.guestPersonIds).toEqual(["p1"]);
});
