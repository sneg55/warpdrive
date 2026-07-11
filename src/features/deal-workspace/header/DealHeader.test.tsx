// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DealWorkspace } from "@/features/deal-workspace/summaryRepo";

// Mock every leaf that reaches a server action, the websocket, or router so the render is pure.
vi.mock("@/features/deal-workspace/actions", () => ({
  changeStageAction: vi.fn(),
  changeOwnerAction: vi.fn(),
  followDealAction: vi.fn(),
  unfollowDealAction: vi.fn(),
  deleteDealAction: vi.fn(),
  markWonAction: vi.fn(),
  markLostAction: vi.fn(),
}));
vi.mock("@/features/deals/archiveActions", () => ({ archiveDealAction: vi.fn() }));
vi.mock("@/features/deals/updateAction", () => ({ updateDealAction: vi.fn() }));
vi.mock("@/features/identity/preferencesActions", () => ({ setDealHeaderBlocksAction: vi.fn() }));
vi.mock("@/features/presence/ui/PresenceBar", () => ({ PresenceBar: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { DealHeader } from "./DealHeader";

afterEach(cleanup);

const workspace = {
  deal: {
    id: "d1",
    title: "Acme renewal",
    pipelineId: "p1",
    status: "open",
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
  },
  pipelineName: "Sales pipeline",
  ownerName: "Ada Lovelace",
  owner: { id: "u1", name: "Ada Lovelace", avatarUrl: null },
  person: null,
  org: null,
  stageProgress: {
    chips: [
      { id: "s1", name: "Qualified", current: false, passed: true, days: 0 },
      { id: "s2", name: "Proposal", current: true, passed: false, days: 3 },
    ],
    daysInStage: 3,
    rotting: false,
  },
  followers: [],
  isFollowedBySelf: false,
  followerIds: [],
  lostReasonName: null,
  lostReasonOptions: [],
  customFieldDefs: [],
} as unknown as DealWorkspace;

const props = {
  workspace,
  selfActorId: "u1",
  canChangeOwner: true,
  canDelete: true,
  assignableUsers: [],
  isHidden: () => false,
  toggle: () => {},
  scheduleFollowUpAfterWon: false,
};

it("renders the title, pipeline name, owner name, and stage names", () => {
  render(<DealHeader {...props} />);
  expect(screen.getByRole("heading", { name: "Acme renewal" })).toBeTruthy();
  expect(screen.getByText("Sales pipeline")).toBeTruthy();
  expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  expect(screen.getByRole("option", { name: /Qualified/ })).toBeTruthy();
  expect(screen.getByRole("option", { name: /Proposal/ })).toBeTruthy();
});
