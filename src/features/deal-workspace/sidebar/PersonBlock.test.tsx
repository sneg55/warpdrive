// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Person } from "@/db/schema";
import type { ContactPoint } from "@/types/contactPoint";
import { HideEmptyContext } from "./sectionFilter";

const { refresh, updatePersonAction } = vi.hoisted(() => ({
  refresh: vi.fn(),
  updatePersonAction: vi.fn<() => Promise<MockActionResult<{ id: string }>>>(() =>
    Promise.resolve({ ok: true, value: { id: "p1" } }),
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/contacts/actions", () => ({ updatePersonAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import type { MockActionResult } from "@/test/actionResult";
import { PersonBlock } from "./PersonBlock";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const callArg = (index: number): unknown =>
  (updatePersonAction.mock.calls as unknown as unknown[][])[index]?.[0];

// Blank firstName/lastName/phones/emails: every row but Name is value-less.
const blankPerson: Person = {
  id: "p1",
  name: "Person One",
  firstName: null,
  lastName: null,
  primaryEmail: null,
  phones: [],
  emails: [],
} as unknown as Person;

it("shows blank First name/Last name/Phone/Email rows when the section is not hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={false}>
      <PersonBlock person={blankPerson} />
    </HideEmptyContext.Provider>,
  );
  expect(screen.getByText("First name")).toBeInTheDocument();
  expect(screen.getByText("Last name")).toBeInTheDocument();
  expect(screen.getByText("Phone")).toBeInTheDocument();
  expect(screen.getByText("Email")).toBeInTheDocument();
});

it("hides blank First name/Last name/Phone/Email rows when the funnel is hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={true}>
      <PersonBlock person={blankPerson} />
    </HideEmptyContext.Provider>,
  );
  expect(screen.queryByText("First name")).not.toBeInTheDocument();
  expect(screen.queryByText("Last name")).not.toBeInTheDocument();
  expect(screen.queryByText("Phone")).not.toBeInTheDocument();
  expect(screen.queryByText("Email")).not.toBeInTheDocument();
  // Name is never value-less; it always stays.
  expect(screen.getByText("Name")).toBeInTheDocument();
});

it("a filled-in field stays visible even while the funnel is hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={true}>
      <PersonBlock person={{ ...blankPerson, firstName: "Mia" }} />
    </HideEmptyContext.Provider>,
  );
  expect(screen.getByText("First name")).toBeInTheDocument();
  expect(screen.queryByText("Last name")).not.toBeInTheDocument();
});

// Regression: a committed write was reported as "Couldn't save" because save() coupled the
// (successful) action result to router.refresh(); when refresh throws, the whole save promise
// rejected and the footer showed a failure banner on a record that actually persisted.
it("does NOT report a failure when the write succeeded but router.refresh throws", async () => {
  refresh.mockImplementationOnce(() => {
    throw new Error("refresh interrupted");
  });
  render(<PersonBlock person={{ ...blankPerson, firstName: "Mia" }} />);

  fireEvent.click(screen.getByRole("button", { name: "Edit First name" }));
  fireEvent.change(screen.getByLabelText("editor-firstName"), { target: { value: "Mira" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
  // The action committed (ok:true), so no error banner and the editor closes normally.
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByLabelText("editor-firstName")).not.toBeInTheDocument());
});

it("tells the surface a field was committed, so surface-owned reads can be refreshed", async () => {
  const onSaved = vi.fn();
  render(<PersonBlock person={{ ...blankPerson, firstName: "Mia" }} onSaved={onSaved} />);

  fireEvent.click(screen.getByRole("button", { name: "Edit First name" }));
  fireEvent.change(screen.getByLabelText("editor-firstName"), { target: { value: "Mira" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
});

it("does not announce a save the server refused", async () => {
  updatePersonAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
  const onSaved = vi.fn();
  render(<PersonBlock person={{ ...blankPerson, firstName: "Mia" }} onSaved={onSaved} />);

  fireEvent.click(screen.getByRole("button", { name: "Edit First name" }));
  fireEvent.change(screen.getByLabelText("editor-firstName"), { target: { value: "Mira" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
  expect(onSaved).not.toHaveBeenCalled();
});

it("renders Phone as a tel: link and Email as a mailto: link", () => {
  const person = {
    ...blankPerson,
    primaryEmail: "ava.bauer63@harborsystems.com",
    phones: [{ value: "+1 555 949 5107", primary: true }],
    emails: [{ value: "ava.bauer63@harborsystems.com", primary: true }],
  } as unknown as Person;
  render(<PersonBlock person={person} />);

  const phone = screen.getByRole("link", { name: "+1 555 949 5107" });
  expect(phone).toHaveAttribute("href", "tel:+15559495107");

  const email = screen.getByRole("link", { name: "ava.bauer63@harborsystems.com" });
  expect(email).toHaveAttribute("href", "mailto:ava.bauer63@harborsystems.com");
});

// Built-in fields hidden in Settings > Data fields must not render here even when they hold a
// value (the deal sidebar previously ignored the hidden set that the person detail page respects).
it("hides the Phone/Email rows whose built-in key is in the hidden set, keeps the rest", () => {
  const person = {
    ...blankPerson,
    firstName: "Mia",
    primaryEmail: "mia@acme.com",
    phones: [{ value: "+1 555 000 0000", primary: true }],
    emails: [{ value: "mia@acme.com", primary: true }],
  } as unknown as Person;
  render(<PersonBlock person={person} hidden={new Set(["phones"])} />);

  expect(screen.queryByText("Phone")).not.toBeInTheDocument();
  // Non-hidden rows still render.
  expect(screen.getByText("Email")).toBeInTheDocument();
  expect(screen.getByText("First name")).toBeInTheDocument();
  expect(screen.getByText("Name")).toBeInTheDocument();
});

it("hides the name-part rows whose built-in key is in the hidden set", () => {
  const person = { ...blankPerson, firstName: "Mia", lastName: "Bauer" } as unknown as Person;
  render(<PersonBlock person={person} hidden={new Set(["firstName", "lastName"])} />);

  expect(screen.queryByText("First name")).not.toBeInTheDocument();
  expect(screen.queryByText("Last name")).not.toBeInTheDocument();
  expect(screen.getByText("Name")).toBeInTheDocument();
});

it("surfaces a permission-specific message when the edit is denied (E_PERM_001)", async () => {
  updatePersonAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
  render(<PersonBlock person={{ ...blankPerson, firstName: "Mia" }} />);

  fireEvent.click(screen.getByRole("button", { name: "Edit First name" }));
  fireEvent.change(screen.getByLabelText("editor-firstName"), { target: { value: "Mira" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/permission/i);
  expect(alert).not.toHaveTextContent("Couldn't save");
  // The editor stays open on failure so the draft is not lost.
  expect(screen.getByLabelText("editor-firstName")).toBeInTheDocument();
});

// The lead drawer reuses PersonBlock but matches PD's compact lead-person section, which shows the
// display Name only (no First name / Last name split). Deal/contact surfaces keep the split.
it("hides the First name and Last name rows when hideNameParts is set (lead drawer parity)", () => {
  render(
    <HideEmptyContext.Provider value={false}>
      <PersonBlock person={{ ...blankPerson, firstName: "Mia", lastName: "Roe" }} hideNameParts />
    </HideEmptyContext.Provider>,
  );
  expect(screen.queryByText("First name")).not.toBeInTheDocument();
  expect(screen.queryByText("Last name")).not.toBeInTheDocument();
  // Name, Phone, Email still render.
  expect(screen.getByText("Name")).toBeInTheDocument();
  expect(screen.getByText("Email")).toBeInTheDocument();
});

it("renders provided label chips under the section (PD's per-person Labels row)", () => {
  render(
    <HideEmptyContext.Provider value={false}>
      <PersonBlock person={blankPerson} labels={[{ name: "Hot", classes: "bg-red-100" }]} />
    </HideEmptyContext.Provider>,
  );
  expect(screen.getByText("Labels")).toBeInTheDocument();
  expect(screen.getByText("Hot")).toBeInTheDocument();
});

// A person can hold several addresses (import, merge, enrichment all append them). The sidebar
// used to render persons.primary_email alone, so every other address was invisible and one
// inline save rewrote the primary while the rest stayed unreachable.
const multiPointPerson = {
  ...blankPerson,
  primaryEmail: "pat.scrimgeour@ottawa.ca",
  emails: [
    { label: "work", value: "pat.scrimgeour@ottawa.ca", primary: true },
    { label: "home", value: "pat@gmail.com", primary: false },
  ],
  phones: [
    { label: "work", value: "+1 555 111 2222", primary: true },
    { label: "mobile", value: "+1 555 333 4444", primary: false },
  ],
} as unknown as Person;

it("renders every stored email and phone, not just the primary", () => {
  render(<PersonBlock person={multiPointPerson} />);
  expect(screen.getByRole("link", { name: "pat.scrimgeour@ottawa.ca" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "pat@gmail.com" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "+1 555 111 2222" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "+1 555 333 4444" })).toBeInTheDocument();
});

it("shows an address held only in the primary_email column alongside the array", () => {
  const person = {
    ...blankPerson,
    primaryEmail: "column-only@acme.com",
    emails: [{ label: "work", value: "array@acme.com", primary: false }],
  } as unknown as Person;
  render(<PersonBlock person={person} />);
  expect(screen.getByRole("link", { name: "column-only@acme.com" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "array@acme.com" })).toBeInTheDocument();
});

it("edits a non-primary email and saves the whole array", async () => {
  render(<PersonBlock person={multiPointPerson} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Email" }));
  fireEvent.change(screen.getByLabelText("Email 2"), { target: { value: "pat@home.ca" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
  expect(callArg(0)).toEqual({
    id: "p1",
    emails: [
      { label: "work", value: "pat.scrimgeour@ottawa.ca", primary: true },
      { label: "home", value: "pat@home.ca", primary: false },
    ],
  });
});

it("adds a second email without dropping the first", async () => {
  const person = {
    ...blankPerson,
    primaryEmail: "one@acme.com",
    emails: [{ label: "work", value: "one@acme.com", primary: true }],
  } as unknown as Person;
  render(<PersonBlock person={person} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Email" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Add email" }));
  fireEvent.change(screen.getByLabelText("Email 2"), { target: { value: "two@acme.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
  expect(callArg(0)).toEqual({
    id: "p1",
    emails: [
      { label: "work", value: "one@acme.com", primary: true },
      { label: "work", value: "two@acme.com", primary: false },
    ],
  });
});

it("promotes a non-primary email so the derived primary_email follows it", async () => {
  render(<PersonBlock person={multiPointPerson} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Email" }));
  fireEvent.click(screen.getByRole("radio", { name: "Make email 2 primary" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
  const emails = (callArg(0) as { emails: ContactPoint[] }).emails;
  expect(emails.find((e) => e.primary)?.value).toBe("pat@gmail.com");
});
