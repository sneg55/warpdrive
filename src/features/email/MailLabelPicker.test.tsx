// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // cmdk/Radix Popover reach for browser APIs jsdom does not implement.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const catalog = [
  { id: "l1", key: "important", name: "Important", color: "red", order: 0 },
  { id: "l2", key: "newsletter", name: "Newsletter", color: "green", order: 1 },
];
const invalidate = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: catalog }) } },
    useUtils: () => ({ mailLabels: { list: { invalidate } } }),
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const createMailLabelAction = vi.fn();
vi.mock("./mailLabelsActions", () => ({
  createMailLabelAction: (...args: unknown[]) => createMailLabelAction(...args),
}));

import { MailLabelPicker } from "./MailLabelPicker";

async function open(): Promise<void> {
  await userEvent.setup().click(screen.getByRole("button", { name: /add label/i }));
}

describe("MailLabelPicker", () => {
  it("lists catalog labels and toggles one on by key", async () => {
    const onChange = vi.fn();
    render(<MailLabelPicker value={[]} onChange={onChange} />);
    await open();
    expect(screen.getByText("Important")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("Newsletter"));
    expect(onChange).toHaveBeenCalledWith(["newsletter"]);
  });

  it("marks an applied label selected and toggles it off", async () => {
    const onChange = vi.fn();
    render(<MailLabelPicker value={["important"]} onChange={onChange} />);
    await open();
    await userEvent.setup().click(screen.getByText("Important"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("offers an inline create for a novel search term and applies the new key", async () => {
    createMailLabelAction.mockResolvedValue({ ok: true, value: { key: "vip", name: "VIP" } });
    const onChange = vi.fn();
    render(<MailLabelPicker value={[]} onChange={onChange} />);
    await open();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search or create/i), "VIP");
    await user.click(screen.getByText(/create "VIP"/i));
    await waitFor(() => expect(createMailLabelAction).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(["vip"]);
    expect(invalidate).toHaveBeenCalled();
  });

  it("does not offer create when the term exactly matches an existing label", async () => {
    render(<MailLabelPicker value={[]} onChange={vi.fn()} />);
    await open();
    await userEvent.setup().type(screen.getByPlaceholderText(/search or create/i), "Important");
    expect(screen.queryByText(/create "/i)).not.toBeInTheDocument();
  });
});
