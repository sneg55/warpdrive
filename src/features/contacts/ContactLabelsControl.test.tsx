// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";

beforeAll(() => {
  // Radix DropdownMenu (in CatalogLabelPicker) reaches for these jsdom-missing APIs.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

type UpdateResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const updatePersonAction = vi.hoisted(() =>
  vi.fn((): Promise<UpdateResult> => Promise.resolve({ ok: true, value: { id: "p1" } })),
);
const updateOrgAction = vi.hoisted(() =>
  vi.fn((): Promise<UpdateResult> => Promise.resolve({ ok: true, value: { id: "o1" } })),
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/contacts/actions", () => ({ updatePersonAction, updateOrgAction }));

const personCatalog = [
  { id: "l1", target: "person", name: "Hot", color: "red", order: 0 },
  { id: "l2", target: "person", name: "Cold", color: "blue", order: 1 },
];
vi.mock("@/lib/trpc-client", () => ({
  trpc: { labels: { listByTarget: { useQuery: () => ({ data: personCatalog }) } } },
}));

import { ActionErrorProvider } from "@/components/shell/ActionErrorProvider";
import { ContactLabelsControl } from "./ContactLabelsControl";

afterEach(() => {
  cleanup();
  updatePersonAction.mockClear();
  updateOrgAction.mockClear();
});

describe("ContactLabelsControl", () => {
  it("renders the applied label chips, colored from the catalog", () => {
    render(<ContactLabelsControl entityType="person" entityId="p1" labels={["Hot", "Cold"]} />);
    expect(screen.getByText("Hot")).toBeInTheDocument();
    expect(screen.getByText("Cold")).toBeInTheDocument();
  });

  it("offers an Add labels affordance", () => {
    render(<ContactLabelsControl entityType="person" entityId="p1" labels={[]} />);
    expect(screen.getByRole("button", { name: /add labels/i })).toBeInTheDocument();
  });

  it("commits the toggled label set through updatePersonAction", async () => {
    const user = userEvent.setup();
    render(<ContactLabelsControl entityType="person" entityId="p1" labels={[]} />);

    await user.click(screen.getByRole("button", { name: /add labels/i }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /hot/i }));

    expect(updatePersonAction).toHaveBeenCalledWith({ id: "p1", labels: ["Hot"] }, "csrf");
  });

  it("surfaces the shared error dialog when a label edit is denied (no silent revert)", async () => {
    const user = userEvent.setup();
    updatePersonAction.mockResolvedValueOnce({
      ok: false as const,
      error: { id: ERROR_IDS.PERM_DENIED },
    });
    render(
      <ActionErrorProvider>
        <ContactLabelsControl entityType="person" entityId="p1" labels={[]} />
      </ActionErrorProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add labels/i }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /hot/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/permission/i);
  });
});
