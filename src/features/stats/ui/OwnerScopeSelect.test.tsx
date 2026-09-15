// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";
import type { OwnerScope } from "@/types/stats";
import { OwnerScopeSelect } from "./OwnerScopeSelect";

afterEach(cleanup);

const USERS = [
  { id: "u-1", name: "Dana Scully", avatarUrl: null },
  { id: "u-2", name: "Fox Mulder", avatarUrl: null },
];
const TEAMS = [{ id: "t-1", name: "West Coast" }];

function setup(overrides: Partial<Parameters<typeof OwnerScopeSelect>[0]> = {}) {
  const onChange = vi.fn<(s: OwnerScope) => void>();
  render(
    <OwnerScopeSelect
      value={{ kind: "me" }}
      onChange={onChange}
      canViewOthers
      users={USERS}
      teams={TEAMS}
      {...overrides}
    />,
  );
  return { onChange };
}

describe("OwnerScopeSelect", () => {
  it("shows the current scope on the trigger", () => {
    setup();
    expect(
      screen.getByRole("button", { name: STRINGS.dashboard.ownerScopeLabel }),
    ).toHaveTextContent(STRINGS.dashboard.ownerMe);
  });

  it("names the selected person on the trigger", () => {
    setup({ value: { kind: "user", userId: "u-2" } });
    expect(
      screen.getByRole("button", { name: STRINGS.dashboard.ownerScopeLabel }),
    ).toHaveTextContent("Fox Mulder");
  });

  it("names the selected team on the trigger", () => {
    setup({ value: { kind: "team", teamId: "t-1" } });
    expect(
      screen.getByRole("button", { name: STRINGS.dashboard.ownerScopeLabel }),
    ).toHaveTextContent("West Coast");
  });

  it("selects a person", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("button", { name: STRINGS.dashboard.ownerScopeLabel }));
    await user.click(screen.getByText("Dana Scully"));
    expect(onChange).toHaveBeenCalledWith({ kind: "user", userId: "u-1" });
  });

  it("selects a team", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("button", { name: STRINGS.dashboard.ownerScopeLabel }));
    await user.click(screen.getByText("West Coast"));
    expect(onChange).toHaveBeenCalledWith({ kind: "team", teamId: "t-1" });
  });

  it("selects everyone", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("button", { name: STRINGS.dashboard.ownerScopeLabel }));
    await user.click(screen.getByText(STRINGS.dashboard.ownerAll));
    expect(onChange).toHaveBeenCalledWith({ kind: "all" });
  });

  it("offers only 'Me' and stays disabled without stats.viewOthers", () => {
    setup({ canViewOthers: false });
    const trigger = screen.getByRole("button", { name: STRINGS.dashboard.ownerScopeLabel });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent(STRINGS.dashboard.ownerMe);
  });
});
