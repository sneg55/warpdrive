// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrgEmailPanel } from "./OrgEmailPanel";

afterEach(cleanup);

describe("OrgEmailPanel", () => {
  it("shows an honest not-applicable state, not the Phase 4 placeholder", () => {
    render(<OrgEmailPanel />);
    expect(screen.queryByText(/phase 4/i)).not.toBeInTheDocument();
    expect(screen.getByText(/tracked on people/i)).toBeInTheDocument();
  });
});
