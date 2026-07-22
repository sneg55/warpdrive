// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const cap = vi.hoisted(() => ({ identifyUser: vi.fn(), resetIdentity: vi.fn() }));
vi.mock("./capture", () => cap);

import { IdentifyUser } from "./IdentifyUser";

const user = { id: "u1", name: "Nick", email: "nick@example.com", role: "admin" };

afterEach(() => vi.clearAllMocks());

it("identifies the user on mount and resets identity on unmount", () => {
  const { unmount } = render(<IdentifyUser user={user} />);
  expect(cap.identifyUser).toHaveBeenCalledWith({
    id: "u1",
    name: "Nick",
    email: "nick@example.com",
    role: "admin",
  });
  unmount();
  expect(cap.resetIdentity).toHaveBeenCalled();
});
