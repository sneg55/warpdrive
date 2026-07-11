// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
import { LinkValue, mailtoHref, telHref } from "./contactLinks";

function withPrefs(node: React.ReactNode, overrides: Partial<typeof INTERFACE_PREFS_DEFAULT>) {
  return render(
    <InterfacePrefsProvider value={{ ...INTERFACE_PREFS_DEFAULT, ...overrides }}>
      {node}
    </InterfacePrefsProvider>,
  );
}

describe("LinkValue interface preferences", () => {
  it("shows the raw phone and same-tab email by default", () => {
    render(
      <>
        <LinkValue href={telHref("4155551234")}>4155551234</LinkValue>
        <LinkValue href={mailtoHref("a@b.com")}>a@b.com</LinkValue>
      </>,
    );
    expect(screen.getByText("4155551234")).toBeTruthy();
    expect(screen.getByText("a@b.com").getAttribute("target")).toBeNull();
  });

  it("formats a tel: link's text when usPhoneFormat is on (href stays digit-stripped)", () => {
    withPrefs(<LinkValue href={telHref("4155551234")}>4155551234</LinkValue>, {
      usPhoneFormat: true,
    });
    const link = screen.getByText("(415) 555-1234");
    expect(link.getAttribute("href")).toBe("tel:4155551234");
  });

  it("opens a mailto: link in a new tab when emailLinksNewTab is on", () => {
    withPrefs(<LinkValue href={mailtoHref("a@b.com")}>a@b.com</LinkValue>, {
      emailLinksNewTab: true,
    });
    const link = screen.getByText("a@b.com");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("does not reformat a non-tel link when usPhoneFormat is on", () => {
    withPrefs(<LinkValue href={mailtoHref("4155551234@b.com")}>4155551234@b.com</LinkValue>, {
      usPhoneFormat: true,
    });
    expect(screen.getByText("4155551234@b.com")).toBeTruthy();
  });
});
