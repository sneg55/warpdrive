// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { invalidateForEntity, invalidateLead, invalidateContactTimeline, invalidateStats } =
  vi.hoisted(() => ({
    invalidateForEntity: vi.fn(() => Promise.resolve()),
    invalidateLead: vi.fn(() => Promise.resolve()),
    invalidateContactTimeline: vi.fn(() => Promise.resolve()),
    invalidateStats: vi.fn(() => Promise.resolve()),
  }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        dayLoad: { invalidate: () => Promise.resolve() },
        listRows: { invalidate: () => Promise.resolve() },
        listForEntity: { invalidate: invalidateForEntity },
      },
      lead: { leadTimeline: { invalidate: invalidateLead } },
      contacts: {
        contactTimeline: { invalidate: invalidateContactTimeline },
        activityStats: { invalidate: invalidateStats },
      },
    }),
    activities: {
      listTypes: { useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }) },
      dayLoad: { useQuery: () => ({ data: undefined }) },
    },
    contacts: {
      listPeople: {
        useQuery: () => ({ data: { rows: [{ id: "p9", name: "Zed Quill" }], total: 1 } }),
      },
      listOrgs: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
  },
}));

const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a2" } })),
}));
vi.mock("./actions", () => ({ createActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { FollowUpPromptProvider, useFollowUpAfterDone } from "./followUpAfterDone";

const LINKS = {
  dealId: "d1",
  leadId: null,
  personId: "p1",
  personName: "Mia Costa",
  orgId: "o1",
  orgName: "Silver Labs",
};
const OTHER_LINKS = {
  dealId: "d2",
  leadId: null,
  personId: null,
  personName: null,
  orgId: null,
  orgName: null,
};
const PERSON_ONLY = {
  dealId: null,
  leadId: null,
  personId: "p1",
  personName: "Mia Costa",
  orgId: null,
  orgName: null,
};

function Probe({ onCreated }: { onCreated?: () => void }): React.ReactNode {
  const promptAfterDone = useFollowUpAfterDone();
  const [prompted, setPrompted] = useState<boolean | null>(null);
  return (
    <>
      <button type="button" onClick={() => setPrompted(promptAfterDone(LINKS, onCreated))}>
        done
      </button>
      <button type="button" onClick={() => promptAfterDone(OTHER_LINKS)}>
        done other
      </button>
      <button type="button" onClick={() => promptAfterDone(PERSON_ONLY)}>
        done person
      </button>
      <span data-testid="state">{prompted === null ? "idle" : String(prompted)}</span>
    </>
  );
}

function Host({ onCreated }: { onCreated?: () => void }): React.ReactNode {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      {mounted && <Probe onCreated={onCreated} />}
      <button type="button" onClick={() => setMounted(false)}>
        unmount
      </button>
    </>
  );
}

function renderProbe(enabled: boolean, onCreated?: () => void): void {
  render(
    <InterfacePrefsProvider
      value={{ ...INTERFACE_PREFS_DEFAULT, scheduleFollowUpAfterDone: enabled }}
    >
      <FollowUpPromptProvider>
        <Host onCreated={onCreated} />
      </FollowUpPromptProvider>
    </InterfacePrefsProvider>,
  );
}

describe("FollowUpPromptProvider invalidation", () => {
  it("refreshes every linked record's timeline after the follow-up is created", async () => {
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Send proposal" } });
    fireEvent.click(screen.getByLabelText("Due date"));
    fireEvent.click(await screen.findByText("10"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidateForEntity).toHaveBeenCalledWith({ entityType: "deal", entityId: "d1" });
    expect(invalidateForEntity).toHaveBeenCalledWith({ entityType: "person", entityId: "p1" });
    expect(invalidateForEntity).toHaveBeenCalledWith({
      entityType: "organization",
      entityId: "o1",
    });
    expect(invalidateContactTimeline).toHaveBeenCalledWith({
      entityType: "person",
      entityId: "p1",
    });
    expect(invalidateContactTimeline).toHaveBeenCalledWith({
      entityType: "organization",
      entityId: "o1",
    });
    expect(invalidateStats).toHaveBeenCalledWith({ entityType: "person", entityId: "p1" });
    expect(invalidateStats).toHaveBeenCalledWith({ entityType: "organization", entityId: "o1" });
    expect(invalidateLead).not.toHaveBeenCalled();
  });

  it("also refreshes a contact the user picked in the form instead of the prefilled one", async () => {
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done other" }));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Send proposal" } });
    fireEvent.click(screen.getByLabelText("Due date"));
    fireEvent.click(await screen.findByText("10"));
    fireEvent.click(screen.getByLabelText("Contact person"));
    fireEvent.click(await screen.findByText("Zed Quill"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(createActivityAction).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: "d2", personId: "p9" }),
      "csrf",
    );
    expect(invalidateContactTimeline).toHaveBeenCalledWith({
      entityType: "person",
      entityId: "p9",
    });
    expect(invalidateForEntity).toHaveBeenCalledWith({ entityType: "deal", entityId: "d2" });
  });
});
