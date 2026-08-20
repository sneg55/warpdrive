// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
  },
}));

import { RecipientsRow } from "./RecipientsRow";

describe("RecipientsRow", () => {
  const noop = vi.fn();

  it("renders To recipient field by default", () => {
    render(
      <RecipientsRow
        to={[]}
        onToChange={noop}
        cc={[]}
        onCcChange={noop}
        bcc={[]}
        onBccChange={noop}
      />,
    );
    expect(screen.getByText("To")).toBeInTheDocument();
  });

  it("hides Cc and Bcc until the expander is clicked", () => {
    render(
      <RecipientsRow
        to={[]}
        onToChange={noop}
        cc={[]}
        onCcChange={noop}
        bcc={[]}
        onBccChange={noop}
      />,
    );
    expect(screen.queryByText("Cc")).not.toBeInTheDocument();
    expect(screen.queryByText("Bcc")).not.toBeInTheDocument();
  });

  it("shows Cc and Bcc after clicking the expander", () => {
    render(
      <RecipientsRow
        to={[]}
        onToChange={noop}
        cc={[]}
        onCcChange={noop}
        bcc={[]}
        onBccChange={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cc\/bcc/i }));
    expect(screen.getByText("Cc")).toBeInTheDocument();
    expect(screen.getByText("Bcc")).toBeInTheDocument();
  });

  it("collapses Cc and Bcc again when the expander is clicked a second time", () => {
    render(
      <RecipientsRow
        to={[]}
        onToChange={noop}
        cc={[]}
        onCcChange={noop}
        bcc={[]}
        onBccChange={noop}
      />,
    );
    const toggle = screen.getByRole("button", { name: /cc\/bcc/i });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /cc\/bcc/i }));
    expect(screen.queryByText("Cc")).not.toBeInTheDocument();
    expect(screen.queryByText("Bcc")).not.toBeInTheDocument();
  });

  it("keeps Cc and Bcc open with no collapse control while they hold addresses", () => {
    render(
      <RecipientsRow
        to={[]}
        onToChange={noop}
        cc={["cc@example.com"]}
        onCcChange={noop}
        bcc={[]}
        onBccChange={noop}
      />,
    );
    expect(screen.getByText("Cc")).toBeInTheDocument();
    expect(screen.getByText("Bcc")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cc\/bcc/i })).not.toBeInTheDocument();
  });
});
