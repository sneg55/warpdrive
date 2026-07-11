// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createPerson = vi.fn<(input: unknown) => Promise<{ ok: boolean; value: { id: string } }>>(
  () => Promise.resolve({ ok: true, value: { id: "p1" } }),
);
const createOrg = vi.fn<(input: unknown) => Promise<{ ok: boolean; value: { id: string } }>>(() =>
  Promise.resolve({ ok: true, value: { id: "o1" } }),
);
vi.mock("./actions", () => ({
  createPersonAction: (input: unknown) => createPerson(input),
  createOrgAction: (input: unknown) => createOrg(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

import { QuickAddContact } from "./QuickAddContact";

afterEach(() => {
  cleanup();
  createPerson.mockClear();
  createOrg.mockClear();
});

describe("QuickAddContact", () => {
  it("creates a person with the entered name", () => {
    render(<QuickAddContact kind="person" />);
    fireEvent.click(screen.getByRole("button", { name: "+ Person" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Roe" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createPerson).toHaveBeenCalledWith(expect.objectContaining({ name: "Jane Roe" }));
  });

  it("creates an organization with the entered name", () => {
    render(<QuickAddContact kind="org" />);
    fireEvent.click(screen.getByRole("button", { name: "+ Organization" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createOrg).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme Inc" }));
  });

  it("does not submit an empty name", () => {
    render(<QuickAddContact kind="person" />);
    fireEvent.click(screen.getByRole("button", { name: "+ Person" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createPerson).not.toHaveBeenCalled();
  });
});
