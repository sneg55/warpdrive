// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Person } from "@/db/schema";
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
