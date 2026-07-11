import { describe, expect, it } from "vitest";
import { PresenceRegistry } from "./presence";

describe("PresenceRegistry", () => {
  it("dedups a user across channels and lists members on join", () => {
    const reg = new PresenceRegistry();
    const a = reg.join("deal:1", { userId: "u1", name: "Alice", connId: "c1" });
    expect(a.users).toEqual([{ userId: "u1", name: "Alice" }]);
    reg.join("deal:1", { userId: "u2", name: "Bob", connId: "c2" });
    expect(reg.snapshot("deal:1")).toHaveLength(2);
  });

  it("removes a member on leave and on dropConnection", () => {
    const reg = new PresenceRegistry();
    reg.join("deal:1", { userId: "u1", name: "Alice", connId: "c1" });
    reg.join("pipeline:7", { userId: "u1", name: "Alice", connId: "c1" });
    const affected = reg.dropConnection("c1");
    expect(affected.sort()).toEqual(["deal:1", "pipeline:7"]);
    expect(reg.snapshot("deal:1")).toHaveLength(0);
  });

  it("keeps a user present if another connection of theirs remains", () => {
    const reg = new PresenceRegistry();
    reg.join("deal:1", { userId: "u1", name: "Alice", connId: "c1" });
    reg.join("deal:1", { userId: "u1", name: "Alice", connId: "c2" });
    reg.leave("deal:1", "c1");
    expect(reg.snapshot("deal:1")).toEqual([{ userId: "u1", name: "Alice" }]);
  });
});
