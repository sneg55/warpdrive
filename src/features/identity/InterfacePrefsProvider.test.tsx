// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it } from "vitest";
import { InterfacePrefsProvider, useInterfacePrefs } from "./InterfacePrefsProvider";

function Probe(): React.ReactNode {
  const p = useInterfacePrefs();
  return (
    <span>
      {`phone:${p.usPhoneFormat}`} {`newtab:${p.emailLinksNewTab}`}{" "}
      {`person:${p.openDetailsAfterCreate.person}`} {`followup:${p.scheduleFollowUpAfterDone}`}
    </span>
  );
}

describe("useInterfacePrefs", () => {
  it("returns all-false defaults with no provider", () => {
    render(<Probe />);
    expect(screen.getByText(/phone:false/)).toBeTruthy();
    expect(screen.getByText(/newtab:false/)).toBeTruthy();
    expect(screen.getByText(/person:false/)).toBeTruthy();
    expect(screen.getByText(/followup:false/)).toBeTruthy();
  });

  it("exposes the provided preference values", () => {
    render(
      <InterfacePrefsProvider
        value={{
          usPhoneFormat: true,
          winSound: false,
          emailLinksNewTab: true,
          prefillParticipantsAsRecipients: false,
          autoPrefixLeadDealTitles: false,
          scheduleFollowUpAfterDone: true,
          openDetailsAfterCreate: { leadDeal: false, person: true, org: false },
        }}
      >
        <Probe />
      </InterfacePrefsProvider>,
    );
    expect(screen.getByText(/phone:true/)).toBeTruthy();
    expect(screen.getByText(/newtab:true/)).toBeTruthy();
    expect(screen.getByText(/person:true/)).toBeTruthy();
    expect(screen.getByText(/followup:true/)).toBeTruthy();
  });
});
