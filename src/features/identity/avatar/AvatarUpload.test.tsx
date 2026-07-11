// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const requestMock = vi.fn(() =>
  Promise.resolve({
    ok: true as const,
    value: {
      post: { url: "https://fake-storage.local/upload", fields: { key: "k" } },
    },
  }),
);
const confirmMock = vi.fn(() =>
  Promise.resolve({ ok: true as const, value: { avatarUrl: "/api/users/u1/avatar?v=up-1" } }),
);
const removeMock = vi.fn(() => Promise.resolve({ ok: true as const, value: { removed: true } }));

vi.mock("./avatarActions", () => ({
  requestAvatarUploadAction: (...a: unknown[]) => requestMock(...(a as [])),
  confirmAvatarUploadAction: (...a: unknown[]) => confirmMock(...(a as [])),
  removeAvatarAction: (...a: unknown[]) => removeMock(...(a as [])),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
vi.stubGlobal("fetch", fetchMock);

import { AvatarUpload } from "./AvatarUpload";

function selectFile(type: string, size = 1000): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], `pic.${type.split("/")[1]}`, { type });
  Object.defineProperty(file, "size", { value: size });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("AvatarUpload", () => {
  it("renders the current avatar image when one is set", () => {
    render(<AvatarUpload name="Ada Lovelace" avatarUrl="/api/users/u1/avatar?v=x" />);
    const img = screen.getByRole("img", { name: "Ada Lovelace" });
    expect(img).toHaveAttribute("src", "/api/users/u1/avatar?v=x");
  });

  it("uploading an image runs the handshake in order and refreshes", async () => {
    render(<AvatarUpload name="Ada" avatarUrl={null} />);
    selectFile("image/png");
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Same csrf token (null in jsdom: no cookie) threaded through request + confirm.
    expect(confirmMock).toHaveBeenCalledWith(null);
    expect(refreshMock).toHaveBeenCalled();
  });

  it("rejects a non-image selection client-side without calling the server", async () => {
    render(<AvatarUpload name="Ada" avatarUrl={null} />);
    selectFile("application/pdf");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("rejects an oversize image client-side without calling the server", async () => {
    render(<AvatarUpload name="Ada" avatarUrl={null} />);
    selectFile("image/png", 5 * 1024 * 1024);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("shows a Remove control that calls removeAvatar when an avatar is set", async () => {
    render(<AvatarUpload name="Ada" avatarUrl="/api/users/u1/avatar?v=x" />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("hides the Remove control when no avatar is set", () => {
    render(<AvatarUpload name="Ada" avatarUrl={null} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });
});
