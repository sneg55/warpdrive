// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk (Combobox) observes its list's size to manage height; jsdom has no ResizeObserver.
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

// Opens the Participants MultiCombobox and toggles an option by its visible label.
function pickParticipant(label: RegExp): void {
  fireEvent.click(screen.getByLabelText("Participants"));
  fireEvent.click(screen.getByRole("option", { name: label }));
}

it("submits subject + assembled dueAt + done, without the 09:00 hardcode", async () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Discovery" } });
  // Start date already defaults to today; only the time needs setting here.
  fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "14:00" } });
  fireEvent.blur(screen.getByLabelText("Start time"));
  fireEvent.click(screen.getByLabelText("Mark as done"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  const [payload] = createActivityAction.mock.calls[0] as unknown as [
    Record<string, unknown>,
    string,
  ];
  expect(payload.subject).toBe("Discovery");
  expect(payload.done).toBe(true);
  expect(payload.dealId).toBe("d1");
  expect(new Date(payload.dueAt as string).getHours()).toBe(14);
});

it("maps Owner to assigneeId (a user) and Participants to guestPersonIds (persons)", async () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Discovery" } });
  // Owner options come from identity.assignableUsers (users): open the combobox and pick the
  // assignable user's row (labeled "Me" in this mock, same text as the default "" row, so scope
  // the click to the listbox and take the second "Me": the first is the default, unassigned row).
  fireEvent.click(screen.getByLabelText("Owner"));
  // cmdk labels its own listbox "Suggestions"; the native Participants <select multiple> below
  // is also an (implicit) listbox, so name-scope to avoid matching both.
  const ownerOptions = within(screen.getByRole("listbox", { name: "Suggestions" })).getAllByText(
    "Me",
  );
  fireEvent.click(ownerOptions[1] as HTMLElement);
  // Participants options come from contacts.listPeopleForOrg (persons): pick "Ann" (p1).
  pickParticipant(/Ann/);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  const [payload] = createActivityAction.mock.calls[0] as unknown as [
    Record<string, unknown>,
    string,
  ];
  // Owner is a user id, never a person id.
  expect(payload.assigneeId).toBe("u1");
  // Participants are person ids, never user ids; participantUserIds stays empty.
  expect(payload.guestPersonIds).toEqual(["p1"]);
  expect(payload.participantUserIds).toEqual([]);
});

it("falls back to the deal's own person for participants when there is no org", () => {
  render(<ActivityComposerInline dealId="d1" personId="p9" orgId={null} onCreated={vi.fn()} />);
  // The deal's person is the sole candidate and is pre-selected, so it shows as a chip.
  expect(screen.getByText("Deal contact")).toBeInTheDocument();
  // Opening the picker confirms it is the only option offered.
  fireEvent.click(screen.getByLabelText("Participants"));
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(1);
  expect(options[0]).toHaveTextContent("Deal contact");
});

it("uses the real person name for the no-org participant fallback when provided", () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId="p9"
      personName="Ann Real"
      orgId={null}
      onCreated={vi.fn()}
    />,
  );
  // "Ann Real" now shows both as the person link chip and the pre-selected participant chip;
  // scope to the participant chip's remove control to assert the participant fallback name.
  expect(screen.getByLabelText("Remove Ann Real")).toBeInTheDocument();
});

it("offers the deal's contact person as a participant even when the deal has an org", () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId="p9"
      personName="Mia Silva"
      orgId="o1"
      onCreated={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByLabelText("Participants"));
  const options = screen.getAllByRole("option");
  // The org query returns Ann (p1); Mia (p9) is the deal's contact and must still appear, first.
  expect(options.map((o) => o.textContent)).toEqual(["Mia Silva", "Ann"]);
});

it("pre-selects the deal's contact person so it is submitted as a participant by default", async () => {
  render(
    <ActivityComposerInline
      dealId="d1"
      personId="p9"
      personName="Mia Silva"
      orgId="o1"
      onCreated={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Discovery" } });
  // No participant interaction: the deal's person should carry through untouched.
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  const [payload] = createActivityAction.mock.calls[0] as unknown as [
    Record<string, unknown>,
    string,
  ];
  expect(payload.guestPersonIds).toEqual(["p9"]);
});

it("defaults the start date to today so a saved activity is never dateless (and thus invisible on the deal feed)", async () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Discovery" } });
  // Deliberately not touching "Start date": today's default should carry through.
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  const [payload] = createActivityAction.mock.calls[0] as unknown as [
    Record<string, unknown>,
    string,
  ];
  expect(payload.dueAt).not.toBeNull();
});

it("blocks save and shows an error when the start date is cleared", async () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Discovery" } });
  fireEvent.click(screen.getByLabelText("Start date"));
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Date is required");
  expect(createActivityAction).not.toHaveBeenCalled();
});

it("resets the Subject field after a successful save", async () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Discovery" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  // Post-reset, the field goes back to the same prefilled state as a fresh composer
  // (the still-selected type's name), not blank.
  await vi.waitFor(() => expect(screen.getByLabelText("Subject")).toHaveValue("Call"));
});

it("still requires a subject when anchored to a lead instead of a deal", () => {
  render(
    <ActivityComposerInline
      dealId={null}
      leadId="l1"
      personId={null}
      orgId={null}
      onCreated={vi.fn()}
    />,
  );
  // The field is prefilled from the type by default; simulate the user clearing it
  // to actually exercise the required-subject validation.
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Subject is required");
  expect(createActivityAction).not.toHaveBeenCalled();
});

it("prefills the subject with the selected type name", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  expect(screen.getByLabelText<HTMLInputElement>("Subject").value).toBe("Call");
});

it("updates an untouched subject when the activity type changes", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Meeting" }));
  expect(screen.getByLabelText<HTMLInputElement>("Subject").value).toBe("Meeting");
});

it("preserves a user-edited subject when the activity type changes", () => {
  render(<ActivityComposerInline dealId="d1" personId={null} orgId="o1" onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Custom subject" } });
  fireEvent.click(screen.getByRole("button", { name: "Meeting" }));
  expect(screen.getByLabelText<HTMLInputElement>("Subject").value).toBe("Custom subject");
});

it("sends leadId (and a null dealId) when anchored to a lead", async () => {
  render(
    <ActivityComposerInline
      dealId={null}
      leadId="l1"
      personId={null}
      orgId={null}
      onCreated={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Qualify" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
  const [payload] = createActivityAction.mock.calls[0] as unknown as [
    Record<string, unknown>,
    string,
  ];
  expect(payload.dealId).toBeNull();
  expect(payload.leadId).toBe("l1");
});
