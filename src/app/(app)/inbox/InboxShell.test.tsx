// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// InboxShell is the persistent two-pane frame (rail | content) that the /inbox layout wraps every
// inbox route in. It renders the folder rail (a client component reading router hooks) beside the
// route's own content, so the rail is present on the list, reader, and compose routes alike.
let pathname = "/inbox";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      inbox: { unreadCount: { useQuery: () => ({ data: 0 }) } },
    },
  },
}));

import { InboxShell } from "./InboxShell";

afterEach(() => {
  cleanup();
  pathname = "/inbox";
});

it("wraps its children with the folder rail on the reader route", () => {
  pathname = "/inbox/thread-1";
  render(
    <InboxShell newEmailEnabled={true}>
      <div data-testid="reader-content">a thread</div>
    </InboxShell>,
  );
  expect(screen.getByRole("navigation", { name: "Mail folders" })).toBeInTheDocument();
  expect(screen.getByTestId("reader-content")).toBeInTheDocument();
});

it("wraps its children with the folder rail on the compose route", () => {
  pathname = "/inbox/compose";
  render(
    <InboxShell newEmailEnabled={true}>
      <div data-testid="compose-content">a composer</div>
    </InboxShell>,
  );
  expect(screen.getByRole("navigation", { name: "Mail folders" })).toBeInTheDocument();
  expect(screen.getByTestId("compose-content")).toBeInTheDocument();
});

it("renders content in a constrained pane to the right of the rail, not full width", () => {
  pathname = "/inbox/thread-1";
  render(
    <InboxShell newEmailEnabled={true}>
      <div data-testid="reader-content">a thread</div>
    </InboxShell>,
  );
  const nav = screen.getByRole("navigation", { name: "Mail folders" });
  const contentPane = screen.getByTestId("reader-content").parentElement;
  // Rail and content share one flex row; the content pane flexes (min-w-0 flex-1) so it sits beside
  // the fixed-width rail instead of spanning the whole viewport.
  expect(contentPane).toHaveClass("min-w-0", "flex-1");
  expect(nav.parentElement).toBe(contentPane?.parentElement);
});
