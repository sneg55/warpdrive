import { describe, expect, it } from "vitest";
import { xDmSettings } from "./settings";

const BASE_URL = "https://crm.example";

describe("xDmSettings", () => {
  it("returns null when either credential is empty", () => {
    expect(xDmSettings({ X_CLIENT_ID: "", X_CLIENT_SECRET: "s", BASE_URL })).toBeNull();
    expect(xDmSettings({ X_CLIENT_ID: "i", X_CLIENT_SECRET: "  ", BASE_URL })).toBeNull();
  });

  it("builds redirectUri from BASE_URL", () => {
    expect(xDmSettings({ X_CLIENT_ID: "i", X_CLIENT_SECRET: "s", BASE_URL })).toEqual({
      clientId: "i",
      clientSecret: "s",
      redirectUri: "https://crm.example/api/x/oauth/callback",
    });
  });
});
