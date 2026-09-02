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
    useUtils: () => ({
      activities: {
        dayLoad: { invalidate: () => Promise.resolve() },
        listRows: { invalidate: () => Promise.resolve() },
      },
    }),
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
      dayLoad: { useQuery: () => ({ data: undefined }) },
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
    allDay: false,
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
    dealTitle: null,
    personName: null,
    orgName: null,
  };
}

it("labels the link rows from the activity's own links, not the deal page's contact", () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId="p-paul"
      personName="Paul Burns"
      orgId="o1"
      orgName="Transit Authority"
      onCreated={vi.fn()}
      editing={{ ...editing(), personId: "p-peter", personName: "Peter Kuusisto" }}
    />,
  );
  expect(screen.getByText("Peter Kuusisto")).toBeInTheDocument();
  expect(screen.queryByText("Paul Burns")).not.toBeInTheDocument();
});

it("renders no person row at all when the activity's linked person is withheld from the actor", () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId="p-paul"
      personName="Paul Burns"
      orgId="o1"
      orgName="Transit Authority"
      onCreated={vi.fn()}
      editing={{
        ...editing(),
        personId: "p-hidden",
        personName: null,
        orgName: "Transit Authority",
      }}
    />,
  );
  expect(screen.queryByLabelText("Remove person link")).not.toBeInTheDocument();
  expect(screen.queryByText("Person")).not.toBeInTheDocument();
  expect(screen.queryByText("Paul Burns")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Remove organization link")).toBeInTheDocument();
});

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

it("omits unchanged links from the patch so a withheld link does not block the save", async () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId="p-paul"
      orgId="o1"
      onCreated={vi.fn()}
      editing={{
        ...editing(),
        personId: "p-hidden",
        personName: null,
        orgName: "Transit Authority",
      }}
    />,
  );
  fireEvent.click(screen.getByLabelText("Remove organization link"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(editActivityAction).toHaveBeenCalled());
  const [patch] = editActivityAction.mock.calls[0] as unknown as [Record<string, unknown>, string];
  expect(patch).not.toHaveProperty("personId");
  expect(patch).not.toHaveProperty("dealId");
  expect(patch.orgId).toBeNull();
});
