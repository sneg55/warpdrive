// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANDING_STRINGS } from "@/constants/landingStrings";
import { CopyCommands } from "./CopyCommands";

const S = LANDING_STRINGS.selfHost;
const LINES = [
  { text: "git clone https://example.com/repo.git && cd repo", comment: null },
  { text: "cp .env.example .env", comment: "secrets" },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return user;
}

describe("CopyCommands", () => {
  it("copies only the commands, without prompts or comments", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const user = stubClipboard(writeText);
    render(<CopyCommands lines={LINES} />);
    await user.click(screen.getByRole("button", { name: S.copy }));
    expect(writeText).toHaveBeenCalledWith(
      "git clone https://example.com/repo.git && cd repo\ncp .env.example .env",
    );
    expect(await screen.findByRole("button", { name: S.copied })).toBeInTheDocument();
  });

  it("says so when the clipboard refuses", async () => {
    const user = stubClipboard(() => Promise.reject(new Error("denied")));
    render(<CopyCommands lines={LINES} />);
    await user.click(screen.getByRole("button", { name: S.copy }));
    expect(await screen.findByRole("button", { name: S.copyFailed })).toBeInTheDocument();
  });
});
