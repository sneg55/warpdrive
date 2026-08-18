// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      listPeople: {
        useQuery: () => ({
          data: {
            rows: [
              { id: "p1", name: "Alice", primaryEmail: "alice@x.com", emails: [] },
              { id: "p2", name: "Bob", primaryEmail: "bob@x.com", emails: [] },
            ],
            total: 2,
          },
        }),
      },
    },
  },
}));

import { useState } from "react";

import { RecipientField } from "./RecipientField";

describe("RecipientField", () => {
  it("shows suggestions when typing in the input", async () => {
    render(<RecipientField label="To" values={[]} onChange={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ali" } });
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
  });

  it("adds a chip when a suggestion is selected via mouseDown (exactly one chip added)", async () => {
    const onChange = vi.fn();
    render(<RecipientField label="To" values={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ali" } });
    await waitFor(() => screen.getByText("Alice"));
    // Selection uses onMouseDown+preventDefault (not onClick) so blur doesn't race.
    fireEvent.mouseDown(screen.getByText("Alice"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["alice@x.com"]);
  });

  it("adds a chip when free-typed email + Enter is pressed", () => {
    const onChange = vi.fn();
    render(<RecipientField label="To" values={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "custom@x.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["custom@x.com"]);
  });

  it("rejects a malformed address on Enter and shows an inline error", () => {
    const onChange = vi.fn();
    render(<RecipientField label="To" values={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
  });

  it("commits a free-typed email when the field loses focus", () => {
    const onChange = vi.fn();
    render(<RecipientField label="To" values={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "custom@x.com" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(["custom@x.com"]);
  });

  it("shows an inline error when a malformed address loses focus, instead of dropping it", () => {
    const onChange = vi.fn();
    render(<RecipientField label="To" values={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
    expect(input).toHaveValue("not-an-email");
  });

  it.each([",", ";", "Tab"])("commits a free-typed email on %s", (key) => {
    const onChange = vi.fn();
    render(<RecipientField label="To" values={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "custom@x.com" } });
    fireEvent.keyDown(input, { key });
    expect(onChange).toHaveBeenCalledWith(["custom@x.com"]);
  });

  it("leaves focus movement alone when Tab is pressed with an empty input", () => {
    const onChange = vi.fn();
    render(<RecipientField label="To" values={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    const tab = fireEvent.keyDown(input, { key: "Tab" });
    expect(tab).toBe(true); // not prevented
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits each address as the separator is typed, character by character", async () => {
    function Harness(): React.ReactNode {
      const [to, setTo] = useState<string[]>([]);
      return <RecipientField label="To" values={to} onChange={setTo} />;
    }
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "a@x.com,b@x.com;");
    expect(screen.getByRole("button", { name: "Remove a@x.com" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove b@x.com" })).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("renders existing values as chips and removes a chip on X click", () => {
    const onChange = vi.fn();
    render(<RecipientField label="To" values={["alice@x.com"]} onChange={onChange} />);
    expect(screen.getByText("alice@x.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove alice@x.com/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
