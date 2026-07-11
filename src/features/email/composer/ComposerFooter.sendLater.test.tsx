// @vitest-environment jsdom
// Phase 7 Send-later tests, split out of ComposerFooter.test.tsx to stay under the line cap.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { ComposerFooter } from "./ComposerFooter";

describe("ComposerFooter Send later (Phase 7)", () => {
  it("Send later is disabled when canSend is false (no recipients)", () => {
    render(
      <ComposerFooter
        canSend={false}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
        onSendLater={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /send later/i })).toBeDisabled();
  });

  it("Send later is disabled while a send is in-flight (sending)", () => {
    render(
      <ComposerFooter
        canSend={true}
        sending={true}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
        onSendLater={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /send later/i })).toBeDisabled();
  });

  it("Send later button is enabled when onSendLater is provided", () => {
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
        onSendLater={vi.fn()}
      />,
    );
    const laterBtn = screen.getByRole("button", { name: /send later/i });
    expect(laterBtn).not.toBeDisabled();
  });

  it("clicking Send later reveals a datetime-local input", async () => {
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
        onSendLater={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /send later/i }));
    expect(await screen.findByTestId("scheduled-at-picker")).toBeInTheDocument();
  });

  it("choosing a future time calls onSendLater with a Date and hides the picker", async () => {
    const onSendLater = vi.fn();
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
        onSendLater={onSendLater}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /send later/i }));
    const picker = await screen.findByTestId("scheduled-at-picker");
    // Set a future datetime value (1 hour from now)
    const future = new Date(Date.now() + 3_600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
    fireEvent.change(picker, { target: { value: local } });
    const confirmBtn = screen.getByRole("button", { name: /^schedule$/i });
    fireEvent.click(confirmBtn);
    expect(onSendLater).toHaveBeenCalledTimes(1);
    const calledWith = onSendLater.mock.calls[0]?.[0] as Date;
    expect(calledWith).toBeInstanceOf(Date);
    expect(calledWith.getTime()).toBeGreaterThan(Date.now());
    // Picker should be hidden after scheduling
    expect(screen.queryByTestId("scheduled-at-picker")).not.toBeInTheDocument();
  });

  it("does not call onSendLater for a past time (validation)", async () => {
    const onSendLater = vi.fn();
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
        onSendLater={onSendLater}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /send later/i }));
    const picker = await screen.findByTestId("scheduled-at-picker");
    const past = new Date(Date.now() - 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`;
    fireEvent.change(picker, { target: { value: local } });
    const confirmBtn = screen.getByRole("button", { name: /^schedule$/i });
    fireEvent.click(confirmBtn);
    expect(onSendLater).not.toHaveBeenCalled();
  });

  it("shows an inline error for a past/now time instead of an error banner", async () => {
    const onSendLater = vi.fn();
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
        onSendLater={onSendLater}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /send later/i }));
    const picker = await screen.findByTestId("scheduled-at-picker");
    const past = new Date(Date.now() - 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`;
    fireEvent.change(picker, { target: { value: local } });
    fireEvent.click(screen.getByRole("button", { name: /^schedule$/i }));
    expect(onSendLater).not.toHaveBeenCalled();
    // Inline validation message, not an alert banner.
    expect(await screen.findByText(/in the future/i)).toBeInTheDocument();
  });

  it("datetime-local picker has a min attribute set to the current local time", async () => {
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
        onSendLater={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /send later/i }));
    const picker = await screen.findByTestId("scheduled-at-picker");
    expect(picker).toHaveAttribute("min");
    expect(picker.getAttribute("min")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
