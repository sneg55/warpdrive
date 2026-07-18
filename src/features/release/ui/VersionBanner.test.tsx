// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASE_DISMISS_KEY } from "../constants";
import type { VersionStatus } from "../types";

const { useVersionMock } = vi.hoisted(() => ({ useVersionMock: vi.fn() }));
vi.mock("./useVersion", () => ({ useVersion: useVersionMock }));

import { VersionBanner } from "./VersionBanner";

const base: VersionStatus = {
  current: "1.6.0",
  latest: "v1.7.0",
  releaseUrl: "https://github.com/sneg55/warpdrive/releases/tag/v1.7.0",
  releaseNotes: "## What's new\n- birthday suggestions",
  updateAvailable: true,
  checkedAt: "2026-07-18T12:00:00.000Z",
  disabled: false,
};

function mockStatus(status: Partial<VersionStatus>): void {
  useVersionMock.mockReturnValue({ data: { ...base, ...status } });
}

beforeEach(() => {
  localStorage.clear();
  useVersionMock.mockReset();
});
afterEach(cleanup);

describe("VersionBanner", () => {
  it("renders nothing when no update is available", () => {
    mockStatus({ updateAvailable: false });
    const { container } = render(<VersionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when updateAvailable is null (dev build)", () => {
    mockStatus({ updateAvailable: null });
    const { container } = render(<VersionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the query has no data", () => {
    useVersionMock.mockReturnValue({ data: undefined });
    const { container } = render(<VersionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the version pair when an update is available", () => {
    mockStatus({});
    render(<VersionBanner />);
    expect(screen.getByText(/v1\.7\.0 is available/)).toBeTruthy();
    expect(screen.getByText(/1\.6\.0/)).toBeTruthy();
  });

  it("hides the banner when the dismissed value matches latest", () => {
    localStorage.setItem(RELEASE_DISMISS_KEY, "v1.7.0");
    mockStatus({});
    const { container } = render(<VersionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("reappears when latest advances past the dismissed value", () => {
    localStorage.setItem(RELEASE_DISMISS_KEY, "v1.7.0");
    mockStatus({ latest: "v1.8.0" });
    render(<VersionBanner />);
    expect(screen.getByText(/v1\.8\.0 is available/)).toBeTruthy();
  });

  it("stores the dismissed version in localStorage when dismiss is clicked", () => {
    mockStatus({});
    render(<VersionBanner />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(localStorage.getItem(RELEASE_DISMISS_KEY)).toBe("v1.7.0");
  });

  it("expands the release notes when the toggle is clicked", () => {
    mockStatus({});
    render(<VersionBanner />);
    expect(screen.queryByText(/birthday suggestions/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /release notes/i }));
    expect(screen.getByText(/birthday suggestions/)).toBeTruthy();
  });

  it("still renders when localStorage.getItem throws (blocked storage)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    mockStatus({});
    expect(() => render(<VersionBanner />)).not.toThrow();
    expect(screen.getByText(/v1\.7\.0 is available/)).toBeTruthy();
  });

  it("dismisses without throwing when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    mockStatus({});
    render(<VersionBanner />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: /dismiss/i }))).not.toThrow();
    expect(screen.queryByText(/v1\.7\.0 is available/)).toBeNull();
  });
});
