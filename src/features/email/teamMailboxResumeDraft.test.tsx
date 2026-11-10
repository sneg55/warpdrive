// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import type { ComposerProps } from "./composer/ComposerProps";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({}),
    email: {
      mailboxes: {
        useQuery: () => ({
          data: [
            {
              id: "personal",
              emailAddress: "me@example.com",
              displayName: "Me",
              status: "connected",
            },
            {
              id: "team",
              emailAddress: "sales@example.com",
              displayName: "Sales",
              status: "connected",
            },
          ],
        }),
      },
    },
  },
}));
vi.mock("@/features/deal-workspace/composer/ActivityComposerInline", () => ({
  ActivityComposerInline: () => null,
}));
vi.mock("@/features/files/FileAttachments", () => ({ FileAttachments: () => null }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("./composer/Composer", () => ({
  Composer: (props: ComposerProps) => (
    <div
      data-testid="composer"
      data-account={props.accountId}
      data-address={props.fromAddress}
      data-thread={props.draft?.threadId ?? ""}
    >
      {props.senderPicker}
    </div>
  ),
}));

afterEach(cleanup);

it.each([
  null,
  "team-thread",
])("resumes a team timeline draft with thread %s in its saved mailbox", (threadId) => {
  render(
    <SharedComposeBar
      scope={{ entityType: "deal", entityId: "deal", personId: "person" }}
      emailAccountId="personal"
      emailAddress="me@example.com"
      resumeDraft={{
        id: "draft",
        accountId: "team",
        threadId,
        subject: "Saved subject",
        bodyHtml: "<p>Saved body</p>",
        toEmails: ["customer@example.com"],
        ccEmails: [],
        visibility: "shared",
        linkDealId: "deal",
        linkPersonId: "person",
        updatedAt: "2026-11-09T00:00:00Z",
      }}
      onActivityCreated={vi.fn()}
      onNoteCreated={vi.fn()}
    />,
  );
  expect(screen.getByTestId("composer").dataset).toMatchObject({
    account: "team",
    address: "sales@example.com",
    thread: threadId ?? "",
  });
  const picker = screen.getByRole("combobox", { name: "From mailbox" });
  expect(picker.textContent).toContain("Sales");
  fireEvent.keyDown(picker, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: "Me <me@example.com>" }));
  expect(screen.getByTestId("composer").dataset).toMatchObject({
    account: "personal",
    address: "me@example.com",
    thread: "",
  });
});
