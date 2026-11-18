// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { FromPicker } from "./FromPicker";

describe("FromPicker", () => {
  it("renders the From label and the mailbox address", () => {
    render(<FromPicker address="me@x.com" />);
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("me@x.com")).toBeInTheDocument();
  });

  it("renders no interactive control while single-mailbox (address is plain text)", () => {
    render(<FromPicker address="me@x.com" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
