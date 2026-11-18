import { vi } from "vitest";

export const REF_LABELS = { user: {}, person: {}, org: {} };

export const LEAD = {
  id: "l1",
  title: "Acme lead",
  value: "1200.00",
  labels: ["Hot"],
  sourceOrigin: "manually_created",
  personName: "Jane Roe",
  orgName: "Acme Inc",
  ownerName: "Nick",
  nextActivityAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  archivedAt: null,
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  convertedDealId: null,
};

export function trpcMock(
  listQuery: (...a: unknown[]) => unknown,
  users: { id: string; name: string }[] = [],
): unknown {
  return {
    trpc: {
      lead: { list: { useQuery: (...a: unknown[]) => listQuery(...a) } },
      identity: { assignableUsers: { useQuery: () => ({ data: users }) } },
      customFields: { listDefs: { useQuery: () => ({ data: [], isLoading: false }) } },
      labels: {
        listByTarget: { useQuery: () => ({ data: [] }) },
        appliedNames: { useQuery: () => ({ data: [] }) },
      },
      useUtils: () => ({
        lead: { list: { invalidate: vi.fn(() => Promise.resolve()) } },
        savedFilters: { listByTarget: { invalidate: vi.fn(() => Promise.resolve()) } },
      }),
      savedFilters: { listByTarget: { useQuery: () => ({ data: [] }) } },
    },
  };
}

export function stubRadixPointer(): void {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
}
