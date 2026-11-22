import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const WORKFLOW = ".github/workflows/deploy.yml";
const hasWorkflow = existsSync(new URL(`../../../${WORKFLOW}`, import.meta.url));

describe("the browser WebSocket URL is a runtime setting, so one image serves any deploy", () => {
  it("the Dockerfile takes no NEXT_PUBLIC_WS_URL build arg", () => {
    expect(read("Dockerfile")).not.toContain("NEXT_PUBLIC_WS_URL");
  });

  it("the compose build passes no NEXT_PUBLIC_WS_URL build arg", () => {
    expect(read("docker-compose.yml")).not.toContain("NEXT_PUBLIC_WS_URL");
  });

  it.skipIf(!hasWorkflow)("the deploy workflow passes no NEXT_PUBLIC_WS_URL build arg", () => {
    expect(read(WORKFLOW)).not.toContain("NEXT_PUBLIC_WS_URL");
  });

  it("no source file reads process.env.NEXT_PUBLIC_WS_URL, which Next would inline at build", () => {
    expect(existsSync(new URL("../../config/clientEnv.ts", import.meta.url))).toBe(false);
    expect(read("src/features/realtime/useRealtimeChannel.ts")).not.toContain("process.env");
  });
});
