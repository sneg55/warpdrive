import { expect, test } from "vitest";
import { buildAuthServerMetadata, buildProtectedResourceMetadata } from "./metadata";

test("builds OAuth authorization server discovery metadata", () => {
  const metadata = buildAuthServerMetadata("https://app.example.com/");

  expect(metadata.authorization_endpoint).toBe("https://app.example.com/oauth/authorize");
  expect(metadata.token_endpoint).toBe("https://app.example.com/oauth/token");
  expect(metadata.registration_endpoint).toBe("https://app.example.com/oauth/register");
  expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
  expect(metadata.grant_types_supported).toEqual(
    expect.arrayContaining(["authorization_code", "refresh_token"]),
  );
});

test("builds protected resource discovery metadata", () => {
  expect(buildProtectedResourceMetadata("https://app.example.com/")).toEqual({
    resource: "https://app.example.com/api/mcp",
    authorization_servers: ["https://app.example.com"],
  });
});
