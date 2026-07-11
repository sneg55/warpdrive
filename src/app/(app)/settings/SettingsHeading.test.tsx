// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsHeading } from "./SettingsHeading";

afterEach(cleanup);

describe("SettingsHeading", () => {
  it("renders a 'Settings / X' breadcrumb linking back to the settings index", () => {
    render(<SettingsHeading title="Users" />);
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("heading", { level: 1, name: "Users" })).not.toBeNull();
  });
});
