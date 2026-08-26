// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";

const config = vi.fn(() =>
  Promise.resolve({
    providers: [
      {
        provider: "apollo",
        enabled: true,
        hasKey: true,
        apiKeyHint: "9f2a",
        throttledUntil: null,
        throttleReason: null,
        needsAttention: false,
        lastOkAt: null,
      },
    ],
    personMappings: [],
    orgMappings: [
      {
        canonicalKey: "org.domain",
        label: "Website / domain",
        targetKind: "builtin" as const,
        targetKey: "domain",
        targetFieldDefId: null,
      },
    ],
    cacheTtlDays: 30,
  }),
);
const listDefs = vi.fn(() => Promise.resolve([]));
const hiddenBuiltins = vi.fn(() =>
  Promise.resolve({ person: [], organization: [], deal: [], activity: [] }),
);
const actor: { type: string } = { type: "admin" };

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ db: {}, actor })),
}));
vi.mock("@/server/trpc/root", () => ({
  createCaller: () => ({ enrichment: { config }, customFields: { listDefs, hiddenBuiltins } }),
}));
vi.mock("./EnrichmentClient", () => ({
  EnrichmentClient: ({ providers }: { providers: { name: string }[] }) => (
    <div>client:{providers.map((p) => p.name).join(",")}</div>
  ),
}));

afterEach(cleanup);

describe("EnrichmentSettingsPage", () => {
  it("renders the admin-only notice for a non-admin and never reads the config", async () => {
    actor.type = "member";
    const { default: Page } = await import("./page");
    render(await Page());
    expect(screen.getByText(ENRICHMENT_STRINGS.settings.adminOnly)).toBeInTheDocument();
    expect(config).not.toHaveBeenCalled();
  });

  it("renders the heading and the client for an admin", async () => {
    actor.type = "admin";
    const { default: Page } = await import("./page");
    render(await Page());
    expect(
      screen.getByRole("heading", { level: 1, name: ENRICHMENT_STRINGS.settings.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("client:Apollo")).toBeInTheDocument();
  });
});
