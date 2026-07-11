// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  // jsdom has no layout/pointer-capture support; Radix Select needs these stubbed.
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
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

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

it("clicking an inactive label chip adds it via setThreadLabelsAction", () => {
  render(
    <ThreadFollowUpControls
      threadId="t1"
      followUpStatus={null}
      labels={[]}
      onChanged={onChanged}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Important" }));
  expect(setThreadLabelsMock).toHaveBeenCalledWith("csrf", {
    threadId: "t1",
    labels: ["important"],
  });
});

it("clicking an active label chip removes it via setThreadLabelsAction", () => {
  render(
    <ThreadFollowUpControls
      threadId="t1"
      followUpStatus={null}
      labels={["important"]}
      onChanged={onChanged}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Important" }));
  expect(setThreadLabelsMock).toHaveBeenCalledWith("csrf", { threadId: "t1", labels: [] });
});
