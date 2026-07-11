// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const followContactAction = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true as const })));
const unfollowContactAction = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true as const })));
vi.mock("@/features/contacts/followerActions", () => ({
  followContactAction,
  unfollowContactAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { ContactFollowersButton } from "./ContactFollowersButton";

afterEach(() => {
  cleanup();
  followContactAction.mockClear();
  unfollowContactAction.mockClear();
});

const followers = [
  { id: "u1", name: "Ada Lovelace", avatarUrl: null },
  { id: "u2", name: "Alan Turing", avatarUrl: null },
];

it("renders the follower count", () => {
  render(
    <ContactFollowersButton
      entityType="person"
      entityId="pe1"
      followers={followers}
      isFollowedBySelf={false}
    />,
  );
  expect(screen.getByText("2 followers")).toBeTruthy();
});

it("opening the menu shows follower names", async () => {
  const user = userEvent.setup();
  render(
    <ContactFollowersButton
      entityType="person"
      entityId="pe1"
      followers={followers}
      isFollowedBySelf={false}
    />,
  );
  await user.click(screen.getByRole("button", { name: /followers/ }));
  expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  expect(screen.getByText("Alan Turing")).toBeTruthy();
});

it("toggles follow via followContactAction when not yet following", async () => {
  const user = userEvent.setup();
  render(
    <ContactFollowersButton
      entityType="person"
      entityId="pe1"
      followers={followers}
      isFollowedBySelf={false}
    />,
  );
  await user.click(screen.getByRole("button", { name: /followers/ }));
  await user.click(screen.getByRole("menuitem", { name: "Follow" }));
  expect(followContactAction).toHaveBeenCalledWith(
    { entityType: "person", entityId: "pe1" },
    "csrf",
  );
  expect(unfollowContactAction).not.toHaveBeenCalled();
});

it("toggles unfollow via unfollowContactAction when already following, for an organization", async () => {
  const user = userEvent.setup();
  render(
    <ContactFollowersButton
      entityType="organization"
      entityId="o1"
      followers={followers}
      isFollowedBySelf={true}
    />,
  );
  await user.click(screen.getByRole("button", { name: /followers/ }));
  await user.click(screen.getByRole("menuitem", { name: "Following" }));
  expect(unfollowContactAction).toHaveBeenCalledWith(
    { entityType: "organization", entityId: "o1" },
    "csrf",
  );
  expect(followContactAction).not.toHaveBeenCalled();
});
