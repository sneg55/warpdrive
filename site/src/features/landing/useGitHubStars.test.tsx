// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGitHubStars } from "./useGitHubStars";

const REPO = "https://github.com/sneg55/warpdrive";
const API = "https://api.github.com/repos/sneg55/warpdrive";

function stubFetch(impl: (url: string) => Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => impl(String(input)));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGitHubStars", () => {
  it("resolves the stargazer count from the GitHub repo API", async () => {
    const spy = stubFetch(
      async () => new Response(JSON.stringify({ stargazers_count: 1234 }), { status: 200 }),
    );
    const { result } = renderHook(() => useGitHubStars(REPO));

    await waitFor(() => expect(result.current).toBe(1234));
    expect(spy).toHaveBeenCalledWith(API, expect.objectContaining({ signal: expect.anything() }));
  });

  it("stays null when the API responds with an error status", async () => {
    const spy = stubFetch(async () => new Response("not found", { status: 404 }));
    const { result } = renderHook(() => useGitHubStars(REPO));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("stays null when the fetch rejects", async () => {
    const spy = stubFetch(async () => {
      throw new Error("network down");
    });
    const { result } = renderHook(() => useGitHubStars(REPO));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("stays null when the payload has no numeric star count", async () => {
    stubFetch(async () => new Response(JSON.stringify({ stargazers_count: "many" }), { status: 200 }));
    const { result } = renderHook(() => useGitHubStars(REPO));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
