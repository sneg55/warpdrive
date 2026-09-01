// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { ProviderId, ProviderOutcome } from "../providers/types";
import type { BadgedProspect } from "./types";

vi.mock("../prospectActions", () => ({ revealProspectsAction: vi.fn() }));
vi.mock("../prospectApplyActions", () => ({ applyProspectsAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { enrichment: { revealBatch: { useQuery: () => ({ data: undefined }) } } },
}));

import { revealProspectsAction } from "../prospectActions";
import { applyProspectsAction } from "../prospectApplyActions";
import { useProspectFlow } from "./useProspectFlow";

const S = ENRICHMENT_STRINGS.prospects;

const ORG = "11111111-1111-4111-8111-111111111111";
const OK: ProviderOutcome = { provider: "apollo", kind: "ok" };

afterEach(cleanup);

function profile(providerRef: string): BadgedProspect {
  return {
    providerRef,
    fullName: "Ada Lovelace",
    hasEmail: true,
    hasPhone: false,
    match: { kind: "new" },
  };
}

describe("useProspectFlow", () => {
  it("adopts an offered provider once the provider list has loaded", () => {
    const { result, rerender } = renderHook(
      ({ providers }: { providers: ProviderId[] }) => useProspectFlow(ORG, providers),
      { initialProps: { providers: [] as ProviderId[] } },
    );
    rerender({ providers: ["rocketreach"] });
    expect(result.current.filters.provider).toBe("rocketreach");
  });

  it("leaves a provider the install offers alone", () => {
    const { result, rerender } = renderHook(
      ({ providers }: { providers: ProviderId[] }) => useProspectFlow(ORG, providers),
      { initialProps: { providers: ["apollo", "rocketreach"] as ProviderId[] } },
    );
    act(() => {
      result.current.setFilters({ ...result.current.filters, provider: "rocketreach" });
    });
    rerender({ providers: ["apollo", "rocketreach"] });
    expect(result.current.filters.provider).toBe("rocketreach");
  });

  it("drops selections that the dropped results can no longer back", () => {
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    act(() => {
      result.current.absorbPage([profile("p1")], false, OK);
    });
    act(() => {
      result.current.selection.toggle("p1");
    });
    expect(result.current.selection.count).toBe(1);
    act(() => {
      result.current.setFilters({ ...result.current.filters, title: "head of growth" });
    });
    expect(result.current.profiles).toHaveLength(0);
    expect(result.current.selection.count).toBe(0);
  });

  it("counts a fresh search as a new generation so the same filters run again", () => {
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    const first = result.current.generation;
    act(() => {
      result.current.search();
    });
    const second = result.current.generation;
    expect(second).not.toBe(first);
    act(() => {
      result.current.search();
    });
    expect(result.current.generation).not.toBe(second);
    expect(result.current.searched).toBe(true);
  });

  it("stops apply and reports a mapping change when reveal chunks carry different fingerprints", async () => {
    const revealMock = vi.mocked(revealProspectsAction);
    let call = 0;
    revealMock.mockImplementation(() => {
      call += 1;
      const ref = `p${call}`;
      return Promise.resolve({
        ok: true,
        value: {
          items: [
            {
              providerRef: ref,
              profile: profile(ref),
              outcomes: [],
              fields: [],
              match: { kind: "new" as const },
            },
          ],
          failures: [],
          mappingsFingerprint: call === 1 ? "fp-a" : "fp-b",
        },
      });
    });

    const refs = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    act(() => {
      result.current.absorbPage(refs.map(profile), false, OK);
    });
    act(() => {
      result.current.selection.selectMany(refs);
    });
    act(() => {
      result.current.startReveal();
    });
    await waitFor(() => expect(result.current.queue.status).toBe("done"));

    const applyMock = vi.mocked(applyProspectsAction);
    await act(async () => {
      await result.current.apply([]);
    });

    expect(applyMock).not.toHaveBeenCalled();
    expect(result.current.applyError).toBe(S.mappingsChangedError);
  });

  it("reports every person landing, so the caller can close and refresh", async () => {
    vi.mocked(applyProspectsAction).mockResolvedValue({
      ok: true,
      value: [
        { providerRef: "a", result: { ok: true, personId: "p1", appliedFields: ["person.email"] } },
        { providerRef: "b", result: { ok: true, personId: "p2", appliedFields: ["person.email"] } },
      ],
    });
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    let summary: string | undefined;
    await act(async () => {
      summary = await result.current.apply([
        { providerRef: "a", selections: [] },
        { providerRef: "b", selections: [] },
      ]);
    });
    expect(summary).toBe("applied");
  });

  it("reports a partial apply, so the caller leaves the failures on screen", async () => {
    vi.mocked(applyProspectsAction).mockResolvedValue({
      ok: true,
      value: [
        { providerRef: "a", result: { ok: true, personId: "p1", appliedFields: ["person.email"] } },
        { providerRef: "b", result: { ok: false, errorId: "E_ENRICH_006" } },
      ],
    });
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    let summary: string | undefined;
    await act(async () => {
      summary = await result.current.apply([
        { providerRef: "a", selections: [] },
        { providerRef: "b", selections: [] },
      ]);
    });
    expect(summary).toBe("partial");
  });

  it("reports an apply the server refused, which lands nothing", async () => {
    vi.mocked(applyProspectsAction).mockResolvedValue({
      ok: false,
      error: { id: "E_ENRICH_002" },
    });
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    let summary: string | undefined;
    await act(async () => {
      summary = await result.current.apply([{ providerRef: "a", selections: [] }]);
    });
    expect(summary).toBe("failed");
  });

  it("keeps a person marked added when a later retry of someone else fails", async () => {
    vi.mocked(applyProspectsAction)
      .mockResolvedValueOnce({
        ok: true,
        value: [
          { providerRef: "a", result: { ok: true, personId: "p1", appliedFields: ["x"] } },
          { providerRef: "b", result: { ok: false, errorId: "E_ENRICH_006" } },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [{ providerRef: "b", result: { ok: false, errorId: "E_ENRICH_006" } }],
      });
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    await act(async () => {
      await result.current.apply([
        { providerRef: "a", selections: [] },
        { providerRef: "b", selections: [] },
      ]);
    });
    await act(async () => {
      await result.current.apply([{ providerRef: "b", selections: [] }]);
    });
    expect(result.current.outcomes.a).toBe("created");
    expect(result.current.outcomes.b).toEqual({ errorId: "E_ENRICH_006" });
  });

  it("reports an apply where every person failed as landing nothing", async () => {
    vi.mocked(applyProspectsAction).mockResolvedValue({
      ok: true,
      value: [
        { providerRef: "a", result: { ok: false, errorId: "E_ENRICH_006" } },
        { providerRef: "b", result: { ok: false, errorId: "E_ENRICH_006" } },
      ],
    });
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    let summary: string | undefined;
    await act(async () => {
      summary = await result.current.apply([
        { providerRef: "a", selections: [] },
        { providerRef: "b", selections: [] },
      ]);
    });
    expect(summary).toBe("failed");
    expect(result.current.outcomes.a).toEqual({ errorId: "E_ENRICH_006" });
  });

  it("frees the apply button again after a reset discards an apply still in flight", async () => {
    let settle: (value: Awaited<ReturnType<typeof applyProspectsAction>>) => void = () => undefined;
    vi.mocked(applyProspectsAction).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useProspectFlow(ORG, ["apollo"]));
    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.apply([{ providerRef: "a", selections: [] }]);
    });
    expect(result.current.applying).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.applying).toBe(false);

    let summary: unknown;
    await act(async () => {
      settle({
        ok: true,
        value: [{ providerRef: "a", result: { ok: true, personId: "p", appliedFields: [] } }],
      });
      summary = await pending;
    });
    expect(result.current.applying).toBe(false);
    expect(result.current.outcomes).toEqual({});
    expect(summary).toBe("applied");
  });
});
