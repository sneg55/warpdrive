// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const { invalidateForEntity, invalidateLead, invalidateContactTimeline, invalidateStats } =
  vi.hoisted(() => ({
    invalidateForEntity: vi.fn(() => Promise.resolve()),
    invalidateLead: vi.fn(() => Promise.resolve()),
    invalidateContactTimeline: vi.fn(() => Promise.resolve()),
    invalidateStats: vi.fn(() => Promise.resolve()),
  }));
vi.mock("@/features/email/composer/RichTextBodyLazy", () => ({
  RichTextBody: ({ onChange }: { onChange: (h: string) => void }) => (
    <textarea aria-label="Note" onChange={(e) => onChange(e.target.value)} />
  ),
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
      availability: { useQuery: () => ({ data: { busy: false } }) },
    },
    identity: { assignableUsers: { useQuery: () => ({ data: [{ id: "u1", name: "Me" }] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
  },
}));

const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a2" } })),
}));
vi.mock("./actions", () => ({ createActivityAction, editActivityAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { FollowUpPromptProvider, followUpLinksOf, useFollowUpAfterDone } from "./followUpAfterDone";

const LINKS = {
  dealId: "d1",
  dealTitle: "Acme renewal",
  leadId: null,
  personId: "p1",
  personName: "Mia Costa",
  orgId: "o1",
  orgName: "Silver Labs",
};
const OTHER_LINKS = {
  dealId: "d2",
  dealTitle: null,
  leadId: null,
  personId: null,
  personName: null,
  orgId: null,
  orgName: null,
};
const PERSON_ONLY = {
  dealId: null,
  dealTitle: null,
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

describe("FollowUpPromptProvider + useFollowUpAfterDone", () => {
  it("opens the add-activity prompt when the preference is on", async () => {
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(await screen.findByRole("dialog", { name: "Add activity" })).toBeInTheDocument();
    expect(screen.getByTestId("state")).toHaveTextContent("true");
  });

  it("does nothing when the preference is off", () => {
    renderProbe(false);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("state")).toHaveTextContent("false");
  });

  it("does nothing outside a provider", () => {
    render(
      <InterfacePrefsProvider
        value={{ ...INTERFACE_PREFS_DEFAULT, scheduleFollowUpAfterDone: true }}
      >
        <Probe />
      </InterfacePrefsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("state")).toHaveTextContent("false");
  });

  it("keeps the prompt open when the component that requested it unmounts", async () => {
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    await screen.findByRole("dialog", { name: "Add activity" });
    fireEvent.click(screen.getByRole("button", { name: "unmount", hidden: true }));
    expect(screen.queryByRole("button", { name: "done", hidden: true })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Add activity" })).toBeInTheDocument();
  });

  it("renders the full activity composer with the completed activity's links as chips", async () => {
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(await screen.findByText("Acme renewal")).toBeInTheDocument();
    expect(screen.getByText("Silver Labs")).toBeInTheDocument();
    expect(screen.getAllByText("Mia Costa").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Remove person link" })).toBeInTheDocument();
    expect(screen.getByLabelText("Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("a later prompt replaces an open one with fresh fields instead of mixing state", async () => {
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    fireEvent.change(await screen.findByLabelText("Subject"), { target: { value: "First" } });
    expect(screen.getByText("Silver Labs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "done other", hidden: true }));
    await waitFor(() => expect(screen.getByLabelText("Subject")).toHaveValue("Call"));
    expect(screen.queryByText("Silver Labs")).toBeNull();
  });

  it("a person-only completion still prompts and links the follow-up to that person", async () => {
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done person" }));
    fireEvent.change(await screen.findByLabelText("Subject"), { target: { value: "Call back" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createActivityAction).toHaveBeenCalledWith(
        expect.objectContaining({ dealId: null, personId: "p1", orgId: null }),
        "csrf",
      ),
    );
  });

  it("followUpLinksOf carries the linked names so the prompt can label them", () => {
    expect(
      followUpLinksOf({
        dealId: "d1",
        dealTitle: "Acme renewal",
        personId: "p1",
        personName: "Mia Costa",
        orgId: "o1",
        orgName: "Silver Labs",
      }),
    ).toEqual(LINKS);
    expect(followUpLinksOf({ dealId: null, personId: null, orgId: null })).toEqual({
      dealId: null,
      dealTitle: null,
      leadId: null,
      personId: null,
      personName: null,
      orgId: null,
      orgName: null,
    });
  });

  it("a save that finishes after the prompt was replaced does not close the newer prompt", async () => {
    let finish: () => void = () => {};
    createActivityAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true as const, value: { id: "a2" } });
        }),
    );
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    fireEvent.change(await screen.findByLabelText("Subject"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(createActivityAction).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "done other" }));
    fireEvent.change(await screen.findByLabelText("Subject"), { target: { value: "Second" } });
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await waitFor(() => expect(invalidateForEntity).toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "Add activity" })).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveValue("Second");
  });

  it("dismissing the prompt closes it without creating anything", async () => {
    renderProbe(true);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createActivityAction).not.toHaveBeenCalled();
  });

  it("saving from the prompt links the follow-up to the completed activity's records", async () => {
    const onCreated = vi.fn();
    renderProbe(true, onCreated);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    fireEvent.change(await screen.findByLabelText("Subject"), {
      target: { value: "Send proposal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createActivityAction).toHaveBeenCalledWith(
        expect.objectContaining({ dealId: "d1", leadId: null, personId: "p1", orgId: "o1" }),
        "csrf",
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
