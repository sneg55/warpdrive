// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { QuotaRemaining } from "@/features/enrichment/providers/types";
import { ProviderCard, type ProviderCardView } from "./ProviderCard";

const S = ENRICHMENT_STRINGS.settings;

afterEach(cleanup);

const BASE: ProviderCardView = {
  provider: "apollo",
  name: "Apollo",
  enabled: false,
  hasKey: false,
  apiKeyHint: null,
  throttledUntilIso: null,
  throttleReason: null,
  needsAttention: false,
};

function renderCard(
  view: Partial<ProviderCardView>,
  handlers: Record<string, () => void> = {},
  extra: {
    testResult?: string | null;
    testQuota?: QuotaRemaining | null;
    testNotEntitled?: readonly string[] | null;
    pending?: boolean;
    testing?: boolean;
  } = {},
) {
  const props = {
    onToggle: vi.fn(),
    onSaveKey: vi.fn(),
    onRemoveKey: vi.fn(),
    onTest: vi.fn(),
    ...handlers,
  };
  render(
    <ProviderCard
      view={{ ...BASE, ...view }}
      now={new Date("2026-08-24T09:00:00Z")}
      {...props}
      {...extra}
    />,
  );
  return props;
}

describe("ProviderCard", () => {
  it("disables the toggle and explains why while no key is stored", () => {
    renderCard({});
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(S.needsKeyFirst)).toBeInTheDocument();
    expect(screen.getByText(S.statusNoKey)).toBeInTheDocument();
  });

  it("enables the toggle once a key is stored", () => {
    const { onToggle } = renderCard({ hasKey: true, apiKeyHint: "9f2a" });
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeEnabled();
    expect(screen.queryByText(S.needsKeyFirst)).toBeNull();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("shows only the trailing hint, never a key value, once one is stored", () => {
    renderCard({ hasKey: true, apiKeyHint: "9f2a", enabled: true });
    expect(screen.getByText(S.keyHint("9f2a"))).toBeInTheDocument();
    const field = screen.getByLabelText(S.apiKeyLabel);
    expect(field).toHaveValue("");
    expect(screen.getByText(S.statusEnabled)).toBeInTheDocument();
  });

  it("reports a rejected key ahead of the enabled state", () => {
    renderCard({ hasKey: true, apiKeyHint: "9f2a", enabled: true, needsAttention: true });
    expect(screen.getByText(S.statusRejected)).toBeInTheDocument();
    expect(screen.queryByText(S.statusEnabled)).toBeNull();
  });

  it("reports a live cooldown as rate limited or out of credits with the clock time", () => {
    const until = new Date("2026-08-24T10:30:00Z");
    const hhmm = `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`;
    renderCard({
      hasKey: true,
      enabled: true,
      throttledUntilIso: until.toISOString(),
      throttleReason: "quota",
    });
    expect(screen.getByText(S.statusQuota(hhmm))).toBeInTheDocument();
    cleanup();
    renderCard({
      hasKey: true,
      enabled: true,
      throttledUntilIso: until.toISOString(),
      throttleReason: "throttled",
    });
    expect(screen.getByText(S.statusThrottled(hhmm))).toBeInTheDocument();
  });

  // The clock is local wall-time, so the server has no business rendering it: before the client
  // has supplied a clock the card must fall through to the plain enabled/disabled line.
  it("renders no cooldown clock until the client supplies a clock", () => {
    render(
      <ProviderCard
        view={{
          ...BASE,
          hasKey: true,
          enabled: true,
          throttledUntilIso: new Date("2026-08-24T10:30:00Z").toISOString(),
          throttleReason: "quota",
        }}
        now={null}
        onToggle={vi.fn()}
        onSaveKey={vi.fn()}
        onRemoveKey={vi.fn()}
        onTest={vi.fn()}
      />,
    );
    expect(screen.getByText(S.statusEnabled)).toBeInTheDocument();
    expect(screen.queryByText(/\d\d:\d\d/)).toBeNull();
  });

  it("ignores a cooldown that has already elapsed", () => {
    renderCard({
      hasKey: true,
      enabled: false,
      throttledUntilIso: new Date("2026-08-24T08:00:00Z").toISOString(),
      throttleReason: "throttled",
    });
    expect(screen.getByText(S.statusDisabled)).toBeInTheDocument();
  });

  it("saves the typed key and clears the field", () => {
    const { onSaveKey } = renderCard({});
    const field = screen.getByLabelText(S.apiKeyLabel);
    fireEvent.change(field, { target: { value: "secret-key-1234" } });
    fireEvent.click(screen.getByRole("button", { name: S.save }));
    expect(onSaveKey).toHaveBeenCalledWith("secret-key-1234");
    expect(field).toHaveValue("");
  });

  it("will not save an empty key", () => {
    const { onSaveKey } = renderCard({});
    fireEvent.click(screen.getByRole("button", { name: S.save }));
    expect(onSaveKey).not.toHaveBeenCalled();
  });

  it("removes a key only after the confirmation dialog is affirmed", () => {
    const { onRemoveKey } = renderCard({ hasKey: true, apiKeyHint: "9f2a" });
    fireEvent.click(screen.getByRole("button", { name: S.remove }));
    expect(onRemoveKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: S.removeConfirm }));
    expect(onRemoveKey).toHaveBeenCalledTimes(1);
  });

  it("offers no Remove key while there is nothing to remove", () => {
    renderCard({});
    expect(screen.queryByRole("button", { name: S.remove })).toBeNull();
  });

  // Remove is the control most likely to be reached while a key save is still in flight, and the
  // two writes would then land in whichever order the server finished them.
  it("locks the toggle, Save and Remove while a mutation is in flight", () => {
    renderCard({ hasKey: true, apiKeyHint: "9f2a" }, {}, { pending: true });
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: S.saving })).toBeDisabled();
    expect(screen.getByRole("button", { name: S.remove })).toBeDisabled();
  });
});

describe("test connection", () => {
  it("is offered only once a key is stored, and says what it costs", () => {
    renderCard({});
    expect(screen.queryByRole("button", { name: S.test })).not.toBeInTheDocument();
    cleanup();
    renderCard({ hasKey: true, apiKeyHint: "a91f" });
    expect(screen.getByRole("button", { name: S.test })).toBeInTheDocument();
    expect(screen.getByText(S.testCost)).toBeInTheDocument();
  });

  it("reports the verdict where the admin is looking", () => {
    renderCard({ hasKey: true }, {});
    cleanup();
    render(
      <ProviderCard
        view={{ ...BASE, hasKey: true }}
        now={new Date("2026-08-24T09:00:00Z")}
        onToggle={vi.fn()}
        onSaveKey={vi.fn()}
        onRemoveKey={vi.fn()}
        onTest={vi.fn()}
        testResult={S.testOk}
      />,
    );
    expect(screen.getByText(S.testOk)).toBeInTheDocument();
  });

  it("reports the remaining allowance next to the verdict", () => {
    renderCard(
      { hasKey: true },
      {},
      { testResult: S.testOk, testQuota: { hourly: 0, daily: 1450 } },
    );
    expect(screen.getByText(S.testOk)).toBeInTheDocument();
    expect(
      screen.getByText(S.testQuotaLine(`${S.testQuotaHourly(0)}, ${S.testQuotaDaily(1450)}`)),
    ).toBeInTheDocument();
  });

  it("names only the window the provider published", () => {
    renderCard({ hasKey: true }, {}, { testResult: S.testOk, testQuota: { daily: 8 } });
    expect(screen.getByText(S.testQuotaLine(S.testQuotaDaily(8)))).toBeInTheDocument();
  });

  it("stays quiet about the allowance when the provider published none", () => {
    renderCard({ hasKey: true }, {}, { testResult: S.testOk });
    expect(screen.queryByText(/Remaining calls/)).toBeNull();
  });

  it("names the lookups the plan does not cover alongside a green verdict", () => {
    renderCard({ hasKey: true }, {}, { testResult: S.testOk, testNotEntitled: ["person"] });
    expect(screen.getByText(S.testOk)).toBeInTheDocument();
    expect(screen.getByText(S.testNotEntitledLine(S.testLookupPerson))).toBeInTheDocument();
  });

  it("stays quiet about plan coverage when every endpoint answered", () => {
    renderCard({ hasKey: true }, {}, { testResult: S.testOk });
    expect(screen.queryByText(/does not include/)).toBeNull();
  });

  it("calls onTest and shows the pending label", () => {
    const props = renderCard({ hasKey: true });
    fireEvent.click(screen.getByRole("button", { name: S.test }));
    expect(props.onTest).toHaveBeenCalledOnce();
    cleanup();
    renderCard({ hasKey: true });
    cleanup();
    render(
      <ProviderCard
        view={{ ...BASE, hasKey: true }}
        now={new Date("2026-08-24T09:00:00Z")}
        onToggle={vi.fn()}
        onSaveKey={vi.fn()}
        onRemoveKey={vi.fn()}
        onTest={vi.fn()}
        testing={true}
      />,
    );
    expect(screen.getByRole("button", { name: S.testing })).toBeDisabled();
  });

  // A key replaced mid-probe would leave the card showing a verdict about the previous credential.
  it("locks the toggle, Save and Remove while its own probe is in flight", () => {
    renderCard({ hasKey: true, apiKeyHint: "9f2a" }, {}, { testing: true });
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: S.save })).toBeDisabled();
    expect(screen.getByRole("button", { name: S.remove })).toBeDisabled();
  });
});

// A cooling provider is filtered out of the usable set, so a probe comes back as a missing key,
// which is not what happened. Better to say the cooldown than to lie about the credential.
it("locks Test connection while the provider is cooling down", () => {
  renderCard({
    hasKey: true,
    enabled: true,
    throttledUntilIso: "2026-08-24T09:05:00.000Z",
    throttleReason: "throttled",
  });

  expect(screen.getByRole("button", { name: S.test })).toBeDisabled();
});
