import type * as Sdk from "@xdevplatform/chat-xdk-server";
import { afterEach, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { juiceboxUnlocker } from "./juicebox";

const sdk = vi.hoisted(() => ({
  hook: null as ((realm: string) => Promise<string>) | null,
  events: [] as string[],
  seen: [] as Array<{ passcode: string; token: string }>,
  exported: [] as Uint8Array[],
  freed: 0,
  unlockMs: 5,
}));

vi.mock("@xdevplatform/chat-xdk-server", async (importOriginal) => {
  const real = await importOriginal<typeof Sdk>();
  return {
    ...real,
    createChat: (o: { getAuthToken: (realm: string) => Promise<string> }) => {
      sdk.hook = o.getAuthToken;
      return Promise.resolve({
        unlock: async (passcode: string) => {
          sdk.events.push(`start ${passcode}`);
          await new Promise((r) => setTimeout(r, sdk.unlockMs));
          const token = (await sdk.hook?.("realm-1")) ?? "";
          sdk.seen.push({ passcode, token });
          sdk.events.push(`end ${passcode}`);
        },
        exportKeys: () => {
          const bytes = new Uint8Array([7, 7, 7]);
          sdk.exported.push(bytes);
          return bytes;
        },
        free: () => {
          sdk.freed += 1;
        },
      });
    },
  };
});

const configFor = (token: string) => ({ token_map: [{ key: "realm-1", value: { token } }] });
const forever = () => new AbortController().signal;

afterEach(() => {
  sdk.events.length = 0;
  sdk.seen.length = 0;
  sdk.exported.length = 0;
  sdk.freed = 0;
  sdk.unlockMs = 5;
});

it("runs concurrent unlocks one at a time, each with its own realm token", async () => {
  const [a, b] = await Promise.all([
    juiceboxUnlocker.unlock(
      { accountId: "a", juiceboxConfig: configFor("token-a"), passcode: "pin-a" },
      forever(),
    ),
    juiceboxUnlocker.unlock(
      { accountId: "b", juiceboxConfig: configFor("token-b"), passcode: "pin-b" },
      forever(),
    ),
  ]);
  expect([a.ok, b.ok]).toEqual([true, true]);
  expect(sdk.seen).toEqual([
    { passcode: "pin-a", token: "token-a" },
    { passcode: "pin-b", token: "token-b" },
  ]);
  expect(sdk.events).toEqual(["start pin-a", "end pin-a", "start pin-b", "end pin-b"]);
  expect(sdk.freed).toBe(2);
});

it("returns E_X_015 timeout when the unlock outlives its signal, then frees without exporting", async () => {
  sdk.unlockMs = 80;
  const r = await juiceboxUnlocker.unlock(
    { accountId: "a", juiceboxConfig: configFor("token-a"), passcode: "pin-a" },
    AbortSignal.timeout(10),
  );
  expect(r.ok ? null : [r.error.id, r.error.context]).toEqual([
    ERROR_IDS.X_UNLOCK_FAILED,
    { accountId: "a", reason: "timeout" },
  ]);
  expect(sdk.events).toEqual(["start pin-a"]);
  const next = await juiceboxUnlocker.unlock(
    { accountId: "b", juiceboxConfig: configFor("token-b"), passcode: "pin-b" },
    forever(),
  );
  expect(next.ok).toBe(true);
  expect(sdk.events).toEqual(["start pin-a", "end pin-a", "start pin-b", "end pin-b"]);
  expect(sdk.exported).toHaveLength(1);
  expect(sdk.freed).toBe(2);
});

it("a queued unlock honours its own time limit", async () => {
  sdk.unlockMs = 80;
  const first = juiceboxUnlocker.unlock(
    { accountId: "a", juiceboxConfig: configFor("token-a"), passcode: "pin-a" },
    forever(),
  );
  const queued = await juiceboxUnlocker.unlock(
    { accountId: "b", juiceboxConfig: configFor("token-b"), passcode: "pin-b" },
    AbortSignal.timeout(10),
  );
  expect(queued.ok ? null : queued.error.context?.reason).toBe("timeout");
  expect((await first).ok).toBe(true);
  expect(sdk.events).toEqual(["start pin-a", "end pin-a"]);
});
