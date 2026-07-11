// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";

type LinkResult = { ok: true; value: { threadId: string } } | { ok: false; error: { id: string } };
const linkThreadMock = vi.fn<() => Promise<LinkResult>>(() =>
  Promise.resolve({ ok: true, value: { threadId: "t1" } }),
);
vi.mock("./linkActions", () => ({
  linkThread: (...a: unknown[]) => linkThreadMock(...(a as [])),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

// LinkExistingCombobox stubbed to a button that emits a fixed id per kind (person->p1, deal->d1).
vi.mock("./LinkExistingCombobox", () => ({
  LinkExistingCombobox: (props: {
    kind: "person" | "deal";
    triggerLabel: string;
    onPick: (id: string) => void;
  }) => (
    <button
      type="button"
      data-testid={`pick-${props.kind}`}
      onClick={() => props.onPick(props.kind === "person" ? "p1" : "d1")}
    >
      {props.triggerLabel}
    </button>
  ),
}));

// QuickAddContact stubbed so its onCreated (new person id) can be fired directly.
vi.mock("@/features/contacts/QuickAddContact", () => ({
  QuickAddContact: (props: { onCreated?: (id: string) => void; triggerLabel?: string }) => (
    <button type="button" data-testid="create-person" onClick={() => props.onCreated?.("np1")}>
      {props.triggerLabel}
    </button>
  ),
}));

// AddDealModal stubbed so its onCreated (new deal id) can be fired directly once opened.
vi.mock("@/features/deals/AddDealModal", () => ({
  AddDealModal: (props: { onCreated: (id: string) => void }) => (
    <button type="button" data-testid="deal-modal-create" onClick={() => props.onCreated("nd1")}>
      create deal
    </button>
  ),
}));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    pipeline: {
      list: {
        useQuery: () => ({
          data: [{ id: "pl1", name: "Sales", stages: [{ id: "s1", name: "New" }] }],
        }),
      },
    },
  },
}));

import { SidebarLinkPanel } from "./SidebarLinkPanel";

const baseProps = {
  threadId: "t1",
  personId: null,
  personName: null,
  dealId: null,
  dealTitle: null,
  subject: "Renewal",
  primaryEmail: "jane@acme.com",
  primaryName: "Jane Doe",
  canEdit: true,
  onLinked: vi.fn(),
};

afterEach(() => {
  cleanup();
  linkThreadMock.mockClear();
  linkThreadMock.mockResolvedValue({ ok: true, value: { threadId: "t1" } });
  reportError.mockClear();
  baseProps.onLinked = vi.fn();
});

describe("SidebarLinkPanel", () => {
  it("renders nothing when the actor cannot edit the mailbox", () => {
    const { container } = render(<SidebarLinkPanel {...baseProps} canEdit={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links the thread to a picked existing person", async () => {
    const onLinked = vi.fn();
    render(<SidebarLinkPanel {...baseProps} onLinked={onLinked} />);
    fireEvent.click(screen.getByTestId("pick-person"));
    await waitFor(() =>
      expect(linkThreadMock).toHaveBeenCalledWith("csrf", { threadId: "t1", personId: "p1" }),
    );
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
  });

  it("links the thread to a picked existing deal", async () => {
    render(<SidebarLinkPanel {...baseProps} />);
    fireEvent.click(screen.getByTestId("pick-deal"));
    await waitFor(() =>
      expect(linkThreadMock).toHaveBeenCalledWith("csrf", { threadId: "t1", dealId: "d1" }),
    );
  });

  it("auto-links to a newly created contact", async () => {
    render(<SidebarLinkPanel {...baseProps} />);
    fireEvent.click(screen.getByTestId("create-person"));
    await waitFor(() =>
      expect(linkThreadMock).toHaveBeenCalledWith("csrf", { threadId: "t1", personId: "np1" }),
    );
  });

  it("auto-links to a newly created deal", async () => {
    render(<SidebarLinkPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: STRINGS.inbox.addNewDeal }));
    fireEvent.click(screen.getByTestId("deal-modal-create"));
    await waitFor(() =>
      expect(linkThreadMock).toHaveBeenCalledWith("csrf", { threadId: "t1", dealId: "nd1" }),
    );
  });

  // A failed link (expired CSRF, record restricted/deleted before click) must surface, not no-op
  // silently, and must not signal success via onLinked (feedback-surface-mutation-failures).
  it("surfaces a failed link and does not call onLinked", async () => {
    linkThreadMock.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const onLinked = vi.fn();
    render(<SidebarLinkPanel {...baseProps} onLinked={onLinked} />);
    fireEvent.click(screen.getByTestId("pick-person"));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(onLinked).not.toHaveBeenCalled();
  });
});
