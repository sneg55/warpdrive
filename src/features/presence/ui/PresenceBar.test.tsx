// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PresenceAvatars } from "./PresenceBar";

describe("PresenceAvatars", () => {
  it("shows others and excludes self", () => {
    render(
      <PresenceAvatars
        users={[
          { userId: "me", name: "Me" },
          { userId: "u2", name: "Bob" },
        ]}
        selfId="me"
      />,
    );
    expect(screen.getByTitle("Bob")).toBeInTheDocument();
    expect(screen.queryByTitle("Me")).not.toBeInTheDocument();
  });

  it("collapses overflow past 3 into +N", () => {
    render(
      <PresenceAvatars
        users={[
          { userId: "u2", name: "B" },
          { userId: "u3", name: "C" },
          { userId: "u4", name: "D" },
          { userId: "u5", name: "E" },
        ]}
        selfId="me"
      />,
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
