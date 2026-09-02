// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { DealParticipant } from "../participantsList";

beforeAll(() => {
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { participantsData } = vi.hoisted(() => ({
  participantsData: { current: [] as unknown[] },
}));
vi.mock("../useParticipants", () => ({
  useParticipants: () => ({
    participants: participantsData.current,
    add: vi.fn(),
    remove: vi.fn(),
    createAndAdd: vi.fn(),
  }),
}));
vi.mock("../ParticipantsDialog", () => ({ ParticipantsDialog: () => null }));

import { ParticipantsSection } from "./ParticipantsSection";

function participant(name: string, isPrimary: boolean): DealParticipant {
  return {
    personId: name,
    name,
    isPrimary,
    isExplicit: !isPrimary,
    orgName: null,
    primaryEmail: null,
    phone: null,
    ownerName: null,
    closedDeals: 0,
    openDeals: 0,
    nextActivityAt: null,
  };
}

function renderSection() {
  return render(<ParticipantsSection title="Participants" dealId="d1" orgId="o1" orgName="PVTA" />);
}

it("stays hidden when the deal's own contact is the only participant", () => {
  participantsData.current = [participant("Peter Kuusisto", true)];
  renderSection();
  expect(screen.queryByText("Participants")).not.toBeInTheDocument();
});

it("lists the deal's contact alongside added participants once any exist", () => {
  participantsData.current = [
    participant("Peter Kuusisto", true),
    participant("Paul Burns", false),
  ];
  renderSection();
  expect(screen.getByRole("link", { name: "Peter Kuusisto" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Paul Burns" })).toBeInTheDocument();
});
