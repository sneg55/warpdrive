// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

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

const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const })),
}));
vi.mock("@/features/activities/actions", () => ({ createActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/email/composer/RichTextBody", () => ({
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

type Payload = Record<string, unknown>;
function lastPayload(): Payload {
  const [payload] = createActivityAction.mock.calls[0] as unknown as [Payload, string];
  return payload;
}

it("submits an end date for a multi-day activity", async () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Conf" } });
  fireEvent.click(screen.getByLabelText("End date"));
  fireEvent.click(await screen.findByText("15"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  const payload = lastPayload();
  expect(payload.endAt).not.toBeNull();
  expect(new Date(payload.endAt as string).getDate()).toBe(15);
});

it("clears a removed link in the submitted payload", async () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId="p9"
      personName="Mia Person"
      orgId="o1"
      dealTitle="Big Deal"
      orgName="Acme Org"
      onCreated={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Remove deal link")).toBeInTheDocument();
  expect(screen.getByLabelText("Remove person link")).toBeInTheDocument();
  expect(screen.getByLabelText("Remove organization link")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Remove organization link"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  const payload = lastPayload();
  expect(payload.orgId).toBeNull();
  expect(payload.dealId).toBe("d1");
  expect(payload.personId).toBe("p9");
});

it("re-adds a removed link via the Add link combobox", async () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId="p9"
      personName="Mia Person"
      orgId="o1"
      dealTitle="Big Deal"
      orgName="Acme Org"
      onCreated={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByLabelText("Remove organization link"));
  fireEvent.click(screen.getByLabelText("Add link"));
  fireEvent.click(screen.getByRole("option", { name: "Acme Org" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  expect(lastPayload().orgId).toBe("o1");
});

it("includes a generated video call link in the submitted payload", async () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Sync" } });
  fireEvent.click(screen.getByRole("button", { name: "Video call" }));
  fireEvent.click(screen.getByRole("button", { name: /video call link/i }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  const url = lastPayload().videoCallUrl;
  expect(typeof url).toBe("string");
  expect(url as string).toMatch(/^https:\/\/\S+$/);
});

it("collapses Location and Video call behind PD-style disclosure links by default", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Location" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Location" }));
  expect(screen.getByLabelText("Location")).toBeInTheDocument();
});

it("renders a Cancel button that collapses the composer via onCancel", () => {
  const onCancel = vi.fn();
  render(
    <ActivityComposerInline
      dealId="d1"
      personId={null}
      orgId="o1"
      onCreated={vi.fn()}
      onCancel={onCancel}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("gives the note edit surface the same amber tint as the Notes tab (bg-warning/10)", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  const surface = screen.getByTestId("note-surface");
  expect(surface.className).toContain("bg-warning/10");
  expect(surface.className).not.toContain("bg-[#FEF6D5]");
});

it("renders the activity-name input as a bordered edit box (Pipedrive parity)", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("Subject").className).toContain("border");
});

it("renders icon+label type buttons (Pipedrive parity) and selecting one sets the type", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  const meeting = screen.getByRole("button", { name: "Meeting" });
  expect(meeting.querySelector("svg")).toBeTruthy();
  expect(meeting.textContent).toContain("Meeting");
  fireEvent.click(meeting);
  expect(screen.getByLabelText<HTMLInputElement>("Subject").value).toBe("Meeting");
});

it("renders the activity-name input at the display size", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  expect(screen.getByLabelText("Subject")).toHaveClass("text-display");
});

it("lays the start and end date controls out on a single compact row", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  const start = screen.getByLabelText("Start date");
  const end = screen.getByLabelText("End date");
  expect(start.parentElement).toBe(end.parentElement);
});

it("Duplicate keeps the current field values but clears done for a fresh draft", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Kickoff" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Mark as done" }));
  expect(screen.getByRole("checkbox", { name: "Mark as done" })).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

  expect(screen.getByLabelText<HTMLInputElement>("Subject").value).toBe("Kickoff");
  expect(screen.getByRole("checkbox", { name: "Mark as done" })).not.toBeChecked();
});
