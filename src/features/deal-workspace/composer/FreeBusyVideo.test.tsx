// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FreeBusyIndicator } from "./FreeBusyIndicator";
import { VideoCallField } from "./VideoCallField";

afterEach(() => {
  cleanup();
});

it("FreeBusyIndicator shows a busy signal when busy and free otherwise", () => {
  const { rerender } = render(<FreeBusyIndicator busy={true} />);
  expect(screen.getByText(/busy/i)).toBeInTheDocument();
  rerender(<FreeBusyIndicator busy={false} />);
  expect(screen.getByText(/free/i)).toBeInTheDocument();
});

it("VideoCallField generates a link on demand and displays it", () => {
  const onChange = vi.fn();
  const { rerender } = render(<VideoCallField value="" onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /video call link/i }));

  expect(onChange).toHaveBeenCalledTimes(1);
  const url = onChange.mock.calls[0]?.[0] as string;
  expect(url).toMatch(/^https:\/\/\S+$/);

  rerender(<VideoCallField value={url} onChange={onChange} />);
  expect(screen.getByText(url)).toBeInTheDocument();
});

it("VideoCallField removes the link", () => {
  const onChange = vi.fn();
  render(<VideoCallField value="https://meet.example/abc" onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /remove video call link/i }));
  expect(onChange).toHaveBeenCalledWith("");
});
