// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DealStatusBadge } from "./DealStatusBadge";

describe("DealStatusBadge", () => {
  it.each([
    ["open", "Open"],
    ["won", "Won"],
    ["lost", "Lost"],
  ] as const)("renders the %s deal state", (status, label) => {
    render(<DealStatusBadge status={status} />);
    expect(screen.getByLabelText(`Deal status: ${label}`)).toHaveTextContent(label);
  });
});
