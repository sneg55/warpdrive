// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { ComposerFooter } from "./ComposerFooter";

describe("ComposerFooter", () => {
  it("renders a Send button that is enabled when canSend is true", () => {
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
      />,
    );
    const sendBtn = screen.getByRole("button", { name: /^send$/i });
    expect(sendBtn).not.toBeDisabled();
    expect(sendBtn.className).toMatch(/bg-success/);
  });

  it("renders a Send later button that is disabled when onSendLater is not provided", () => {
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
      />,
    );
    const laterBtn = screen.getByRole("button", { name: /send later/i });
    expect(laterBtn).toBeDisabled();
  });

  it("renders a Discard button that calls onDiscard", () => {
    const onDiscard = vi.fn();
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={onDiscard}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("disables Send when canSend is false", () => {
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
      />,
    );
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
  });

  it("disables Send while sending is true", () => {
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
      />,
    );
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
  });
});

describe("ComposerFooter signature picker", () => {
  const base = {
    canSend: true,
    sending: false,
    onSend: vi.fn(),
    onDiscard: vi.fn(),
    trackOpens: false,
    onTrackOpensChange: vi.fn(),
    trackLinks: false,
    onTrackLinksChange: vi.fn(),
  };

  it("hides the signature picker when there are no signatures", () => {
    render(<ComposerFooter {...base} signatures={[]} onSignatureChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^signature$/i })).not.toBeInTheDocument();
  });

  it("shows the signature picker when at least one signature exists", () => {
    render(
      <ComposerFooter
        {...base}
        signatures={[{ id: "s1", name: "Sig" }]}
        onSignatureChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^signature$/i })).toBeInTheDocument();
  });
});

describe("ComposerFooter tracking toggles", () => {
  it("renders an open-tracking toggle with correct checked state", () => {
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={true}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("switch", { name: /track opens/i });
    expect(toggle).toBeChecked();
  });

  it("renders a link-tracking toggle with correct checked state", () => {
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={vi.fn()}
        trackLinks={true}
        onTrackLinksChange={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("switch", { name: /track links/i });
    expect(toggle).toBeChecked();
  });

  it("calls onTrackOpensChange when open toggle is clicked", () => {
    const onTrackOpensChange = vi.fn();
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={false}
        onTrackOpensChange={onTrackOpensChange}
        trackLinks={false}
        onTrackLinksChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /track opens/i }));
    expect(onTrackOpensChange).toHaveBeenCalledWith(true);
  });

  it("calls onTrackLinksChange when link toggle is clicked independently", () => {
    const onTrackLinksChange = vi.fn();
    render(
      <ComposerFooter
        canSend={true}
        sending={false}
        onSend={vi.fn()}
        onDiscard={vi.fn()}
        trackOpens={true}
        onTrackOpensChange={vi.fn()}
        trackLinks={false}
        onTrackLinksChange={onTrackLinksChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /track links/i }));
    expect(onTrackLinksChange).toHaveBeenCalledWith(true);
  });
});
