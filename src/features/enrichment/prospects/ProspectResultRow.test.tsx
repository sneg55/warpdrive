// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProspectResultRow } from "./ProspectResultRow";
import type { BadgedProspect } from "./types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function profile(overrides: Partial<BadgedProspect> = {}): BadgedProspect {
  return {
    providerRef: "p1",
    fullName: "Ada Lovelace",
    title: "CTO",
    city: "London",
    country: "United Kingdom",
    hasEmail: true,
    hasPhone: false,
    match: { kind: "new" },
    ...overrides,
  };
}

function row(p: BadgedProspect, checked = false, disabled = false): React.ReactElement {
  return (
    <table>
      <tbody>
        <ProspectResultRow
          profile={p}
          checked={checked}
          disabled={disabled}
          onCheckedChange={vi.fn()}
        />
      </tbody>
    </table>
  );
}

afterEach(cleanup);

describe("ProspectResultRow", () => {
  it("shows the name, title and location", () => {
    render(row(profile()));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("CTO")).toBeInTheDocument();
    expect(screen.getByText("London, United Kingdom")).toBeInTheDocument();
  });

  it("says what the provider has rather than showing a value", () => {
    render(row(profile({ hasEmail: true, hasPhone: true })));
    expect(screen.getByText("email")).toBeInTheDocument();
  });

  it("never shows a phone signal, since a reveal can never produce one", () => {
    render(row(profile({ hasEmail: true, hasPhone: true })));
    expect(screen.queryByText("phone")).not.toBeInTheDocument();
    expect(screen.queryByText(/phone/)).not.toBeInTheDocument();
  });

  it("says so when the provider has nothing to reveal", () => {
    render(row(profile({ hasEmail: false, hasPhone: false })));
    expect(screen.getByText("nothing on file")).toBeInTheDocument();
  });

  it("says so when only a phone is on file, since that cannot be applied either", () => {
    render(row(profile({ hasEmail: false, hasPhone: true })));
    expect(screen.getByText("nothing on file")).toBeInTheDocument();
  });

  it("links a person we already hold and leaves the row selectable", () => {
    render(
      row(
        profile({
          match: { kind: "existing", personId: "abc", personUpdatedAtIso: "2026-08-31T00:00:00Z" },
        }),
      ),
    );
    expect(screen.getByRole("link", { name: "Already in Warpdrive" })).toHaveAttribute(
      "href",
      "/contacts/people/abc",
    );
    expect(screen.getByRole("checkbox", { name: "Ada Lovelace" })).not.toBeDisabled();
  });

  it("shows no badge for a person we do not hold", () => {
    render(row(profile()));
    expect(screen.queryByText("Already in Warpdrive")).not.toBeInTheDocument();
  });

  it("disables the checkbox when the selection is full", () => {
    render(row(profile(), false, true));
    expect(screen.getByRole("checkbox", { name: "Ada Lovelace" })).toBeDisabled();
  });
});
