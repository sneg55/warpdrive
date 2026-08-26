// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Person } from "@/db/schema";
import type { PersonMatchCandidate } from "@/features/contacts/personOptionsRepo";
import { DealPersonSection } from "./DealPersonSection";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const updateDealAction = vi.fn((...args: unknown[]) => {
  void args;
  return Promise.resolve({
    ok: true as const,
    deal: { id: "d1", updatedAt: "2026-01-03T00:00:00.000Z" },
  });
});
vi.mock("@/features/deals/updateAction", () => ({
  updateDealAction: (...args: unknown[]) => updateDealAction(...args),
}));

const createPersonAction = vi.fn((...args: unknown[]) => {
  void args;
  return Promise.resolve({ ok: true as const, value: { id: "new-person" } });
});
vi.mock("@/features/contacts/actions", () => ({
  createPersonAction: (...args: unknown[]) => createPersonAction(...args),
  updatePersonAction: () => Promise.resolve({ ok: true as const, value: { id: "p1" } }),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const OPTIONS: PersonMatchCandidate[] = [
  {
    id: "p-steve",
    name: "Steve Tomkiel",
    emails: ["steve@sdmts.com"],
    phones: ["+1 (619) 555-0134"],
  },
];

function renderSection(
  over: { person?: Person | null; bulkEditing?: boolean; hidden?: ReadonlySet<string> } = {},
) {
  const onStartBulk = vi.fn();
  const onExitBulk = vi.fn();
  render(
    <DealPersonSection
      person={over.person ?? null}
      dealId="d1"
      expectedUpdatedAt="2026-01-02T00:00:00.000Z"
      personOptions={OPTIONS}
      menuItems={[]}
      bulkEditing={over.bulkEditing ?? false}
      onStartBulk={onStartBulk}
      onExitBulk={onExitBulk}
      hidden={over.hidden}
    />,
  );
  return { onStartBulk, onExitBulk };
}

describe("DealPersonSection with no linked person", () => {
  it("still renders the Person panel, so an enabled section never silently disappears", () => {
    renderSection();
    expect(screen.getByText("Person")).toBeInTheDocument();
  });

  it("shows the same field rows a linked person would, with empty values", () => {
    renderSection();
    for (const label of ["Name", "First name", "Last name", "Phone", "Email"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("drops a name-part row hidden in Settings > Data fields", () => {
    renderSection({ hidden: new Set(["firstName", "lastName"]) });
    expect(screen.queryByText("First name")).not.toBeInTheDocument();
    expect(screen.queryByText("Last name")).not.toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("opens the editor from the section pencil", async () => {
    const { onStartBulk } = renderSection();
    await userEvent.click(screen.getByRole("button", { name: /edit person/i }));
    expect(onStartBulk).toHaveBeenCalledTimes(1);
  });

  it("suggests an existing person once a typed email identifies one", async () => {
    renderSection({ bulkEditing: true });
    await userEvent.type(screen.getByLabelText("Email"), "steve@sdmts.com");
    expect(await screen.findByText(/Steve Tomkiel/)).toBeInTheDocument();
  });

  it("suggests an existing person from a phone typed without its country code", async () => {
    renderSection({ bulkEditing: true });
    await userEvent.type(screen.getByLabelText("Phone"), "619-555-0134");
    expect(await screen.findByText(/Steve Tomkiel/)).toBeInTheDocument();
  });

  it("links the suggested person to the deal instead of creating a duplicate", async () => {
    renderSection({ bulkEditing: true });
    await userEvent.type(screen.getByLabelText("Email"), "steve@sdmts.com");
    await userEvent.click(await screen.findByRole("button", { name: /link/i }));

    await waitFor(() =>
      expect(updateDealAction).toHaveBeenCalledWith(
        {
          dealId: "d1",
          expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          personId: "p-steve",
        },
        "csrf",
      ),
    );
    expect(createPersonAction).not.toHaveBeenCalled();
  });

  it("creates a new person and links it when nothing matches", async () => {
    renderSection({ bulkEditing: true });
    await userEvent.type(screen.getByLabelText("First name"), "Dana");
    await userEvent.type(screen.getByLabelText("Last name"), "Whitfield");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createPersonAction).toHaveBeenCalledTimes(1));
    expect(createPersonAction.mock.calls[0]?.[0]).toMatchObject({
      name: "Dana Whitfield",
      firstName: "Dana",
      lastName: "Whitfield",
    });
    await waitFor(() =>
      expect(updateDealAction).toHaveBeenCalledWith(
        expect.objectContaining({ dealId: "d1", personId: "new-person" }),
        "csrf",
      ),
    );
  });

  it("does not save an entirely empty draft", async () => {
    renderSection({ bulkEditing: true });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(createPersonAction).not.toHaveBeenCalled();
    expect(updateDealAction).not.toHaveBeenCalled();
  });
});
