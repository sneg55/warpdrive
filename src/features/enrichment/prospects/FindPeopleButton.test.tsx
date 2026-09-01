// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const opens = vi.hoisted(() => [] as boolean[]);

vi.mock("@/lib/trpc-client", () => ({
  trpc: { enrichment: { status: { useQuery: () => ({ data: { ready: true } }) } } },
}));

vi.mock("./FindPeopleDialog", () => ({
  FindPeopleDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (next: boolean) => void;
  }) => {
    opens.push(open);
    return (
      <button
        type="button"
        onClick={() => {
          onOpenChange(false);
        }}
      >
        close it
      </button>
    );
  },
}));

import { FindPeopleButton } from "./FindPeopleButton";

afterEach(() => {
  cleanup();
  opens.length = 0;
});

const ORG = "11111111-1111-4111-8111-111111111111";

describe("FindPeopleButton", () => {
  it("renders the dialog with open false after a close, so the close is observable rather than an unmount", async () => {
    const user = userEvent.setup();
    render(
      <FindPeopleButton orgId={ORG} orgName="Acme">
        {(item) => (
          <button
            type="button"
            onClick={() => {
              item?.onSelect();
            }}
          >
            {item?.label ?? "unavailable"}
          </button>
        )}
      </FindPeopleButton>,
    );

    await user.click(screen.getByRole("button", { name: "Find people" }));
    expect(opens.at(-1)).toBe(true);

    await user.click(screen.getByRole("button", { name: "close it" }));
    expect(opens.at(-1)).toBe(false);
  });
});
