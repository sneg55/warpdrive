// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const followDealAction = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true as const })));
const unfollowDealAction = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true as const })));
vi.mock("@/features/deal-workspace/actions", () => ({ followDealAction, unfollowDealAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { FollowersButton } from "./FollowersButton";

afterEach(() => {
  cleanup();
  followDealAction.mockClear();
  unfollowDealAction.mockClear();
});

const followers = [
  { id: "u1", name: "Ada Lovelace", avatarUrl: null },
  { id: "u2", name: "Alan Turing", avatarUrl: null },
];

it("renders the follower count", () => {
  render(<FollowersButton dealId="d1" followers={followers} isFollowedBySelf={false} />);
  // The count and label sit in separate nodes inside the trigger, so match on the button's
  // accessible name rather than a single text node.
  expect(screen.getByRole("button", { name: /2 followers/ })).toBeTruthy();
});

it("opening the menu shows follower names", async () => {
  const user = userEvent.setup();
  render(<FollowersButton dealId="d1" followers={followers} isFollowedBySelf={false} />);
  await user.click(screen.getByRole("button", { name: /followers/ }));
  expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  expect(screen.getByText("Alan Turing")).toBeTruthy();
});

it("toggles follow via followDealAction when not yet following", async () => {
  const user = userEvent.setup();
  render(<FollowersButton dealId="d1" followers={followers} isFollowedBySelf={false} />);
  await user.click(screen.getByRole("button", { name: /followers/ }));
  await user.click(screen.getByRole("menuitem", { name: "Follow" }));
  expect(followDealAction).toHaveBeenCalledWith({ dealId: "d1" }, "csrf");
  expect(unfollowDealAction).not.toHaveBeenCalled();
});

it("toggles unfollow via unfollowDealAction when already following", async () => {
  const user = userEvent.setup();
  render(<FollowersButton dealId="d1" followers={followers} isFollowedBySelf={true} />);
  await user.click(screen.getByRole("button", { name: /followers/ }));
  await user.click(screen.getByRole("menuitem", { name: "Following" }));
  expect(unfollowDealAction).toHaveBeenCalledWith({ dealId: "d1" }, "csrf");
  expect(followDealAction).not.toHaveBeenCalled();
});
