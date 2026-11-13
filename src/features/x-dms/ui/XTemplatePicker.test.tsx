// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetch: vi.fn<(input: { id: string }) => Promise<unknown>>(),
  reportError: vi.fn(),
}));

vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => state.reportError,
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { templates: { get: { fetch: state.fetch } } } }),
    email: {
      templates: {
        list: {
          useQuery: () => ({
            data: [
              { id: "t1", name: "Form link" },
              { id: "t2", name: "Follow up" },
            ],
          }),
        },
      },
    },
  },
}));

import { XTemplatePicker } from "./XTemplatePicker";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("picker inserts converted text with merged name", async () => {
  state.fetch.mockResolvedValue({
    id: "t1",
    name: "Form link",
    subject: "ignored",
    bodyHtml:
      '<p>Hi {{person.first_name}},</p><p>Apply <a href="https://example.com/apply">here</a>{{deal.title}}</p>',
  });
  const onInsert = vi.fn();
  const user = userEvent.setup();
  render(<XTemplatePicker participantName="Ada Lovelace" onInsert={onInsert} />);
  await user.click(screen.getByRole("button", { name: "Choose template" }));
  await user.click(await screen.findByRole("menuitem", { name: "Form link" }));
  await vi.waitFor(() =>
    expect(onInsert).toHaveBeenCalledWith("Hi Ada,\n\nApply here (https://example.com/apply)"),
  );
  expect(state.fetch).toHaveBeenCalledWith({ id: "t1" });
});

it("inserts the same template again when picked twice", async () => {
  state.fetch.mockResolvedValue({
    id: "t2",
    name: "Follow up",
    subject: null,
    bodyHtml: "<p>Ping</p>",
  });
  const onInsert = vi.fn();
  const user = userEvent.setup();
  render(<XTemplatePicker participantName="Ada" onInsert={onInsert} />);
  for (let i = 0; i < 2; i++) {
    await user.click(screen.getByRole("button", { name: "Choose template" }));
    await user.click(await screen.findByRole("menuitem", { name: "Follow up" }));
  }
  await vi.waitFor(() => expect(onInsert).toHaveBeenCalledTimes(2));
});

it("reports a failed template load with its id", async () => {
  state.fetch.mockRejectedValue({ message: "E_GMAIL_010" });
  const onInsert = vi.fn();
  const user = userEvent.setup();
  render(<XTemplatePicker participantName="Ada" onInsert={onInsert} />);
  await user.click(screen.getByRole("button", { name: "Choose template" }));
  await user.click(await screen.findByRole("menuitem", { name: "Form link" }));
  await vi.waitFor(() => expect(state.reportError).toHaveBeenCalledWith("E_GMAIL_010"));
  expect(onInsert).not.toHaveBeenCalled();
});
