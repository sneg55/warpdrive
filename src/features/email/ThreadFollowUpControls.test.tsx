// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  // jsdom has no layout/pointer-capture support; Radix Select + cmdk Popover need these stubbed.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

type Res = { ok: true; value: { threadId: string } } | { ok: false; error: string };
const setFollowUpStatusMock = vi.fn<() => Promise<Res>>(() =>
  Promise.resolve({ ok: true, value: { threadId: "t1" } }),
);
const setThreadLabelsMock = vi.fn<() => Promise<Res>>(() =>
  Promise.resolve({ ok: true, value: { threadId: "t1" } }),
);
vi.mock("./threadAttributesActions", () => ({
  setFollowUpStatusAction: (...a: unknown[]) => setFollowUpStatusMock(...(a as [])),
  setThreadLabelsAction: (...a: unknown[]) => setThreadLabelsMock(...(a as [])),
}));
// The label picker imports the create action (which pulls in db); mock it out for jsdom.
vi.mock("./mailLabelsActions", () => ({ createMailLabelAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const catalog = [
  { id: "l1", key: "important", name: "Important", color: "red", order: 0 },
  { id: "l2", key: "to_do", name: "To do", color: "orange", order: 1 },
];
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: catalog }) } },
    useUtils: () => ({ mailLabels: { list: { invalidate: vi.fn() } } }),
  },
}));

import { ThreadFollowUpControls } from "./ThreadFollowUpControls";

afterEach(() => {
  cleanup();
  setFollowUpStatusMock.mockClear();
  setThreadLabelsMock.mockClear();
});

const onChanged = vi.fn();

it("picking a follow-up status calls setFollowUpStatusAction with the picked value", () => {
  render(
    <ThreadFollowUpControls
      threadId="t1"
      followUpStatus={null}
      labels={[]}
      onChanged={onChanged}
    />,
  );
  fireEvent.click(screen.getByLabelText("Follow-up"));
  fireEvent.click(screen.getByText("Waiting"));
  expect(setFollowUpStatusMock).toHaveBeenCalledWith("csrf", { threadId: "t1", status: "waiting" });
});

it("picking an inactive catalog label adds it via setThreadLabelsAction", async () => {
  render(
    <ThreadFollowUpControls
      threadId="t1"
      followUpStatus={null}
      labels={[]}
      onChanged={onChanged}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /add label/i }));
  await user.click(screen.getByText("Important"));
  expect(setThreadLabelsMock).toHaveBeenCalledWith("csrf", {
    threadId: "t1",
    labels: ["important"],
  });
});

it("picking an active catalog label removes it via setThreadLabelsAction", async () => {
  render(
    <ThreadFollowUpControls
      threadId="t1"
      followUpStatus={null}
      labels={["important"]}
      onChanged={onChanged}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /add label/i }));
  // "Important" appears both as an applied chip and as a menu row; target the menu option.
  await user.click(screen.getByRole("option", { name: /Important/ }));
  expect(setThreadLabelsMock).toHaveBeenCalledWith("csrf", { threadId: "t1", labels: [] });
});
