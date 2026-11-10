// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
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
vi.mock("./composer/Composer", () => ({
  Composer: (props: { accountId: string; senderPicker?: ReactNode }) => (
    <div data-testid="reply" data-account={props.accountId}>
      {props.senderPicker}
    </div>
  ),
}));

import { ReaderActions } from "./ReaderActions";

it("opens a team reply with the team sender selected and the mailbox picker available", () => {
  render(
    <ReaderActions
      accountId="team"
      threadId="thread"
      selfEmail="sales@example.com"
      initialMode="reply"
      message={{
        fromEmail: "customer@example.com",
        toEmails: ["sales@example.com"],
        ccEmails: [],
        subject: "Question",
        bodyHtml: "Hello",
      }}
    />,
  );
  expect(screen.getByRole("combobox", { name: "From mailbox" }).textContent).toContain("Sales");
  expect(screen.getByTestId("reply").dataset.account).toBe("team");
});
