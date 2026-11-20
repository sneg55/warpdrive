import { fileURLToPath } from "node:url";
import type { Logger } from "vite";
import { loadConfigFromFile } from "vite";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const CONFIG_FILE = `${ROOT}vitest.config.ts`;
const NATIVE_LOADER_WARNING = "unsupported by `configLoader: 'native'`";

function warningRecorder(warnings: string[]): Logger {
  return {
    hasWarned: false,
    info() {},
    warn(message) {
      warnings.push(message);
    },
    warnOnce(message) {
      warnings.push(message);
    },
    error(message) {
      warnings.push(message);
    },
    clearScreen() {},
    hasErrorLogged() {
      return false;
    },
  };
}

describe("vitest config loader compatibility", () => {
  it("emits no native-loader incompatibility warning under the bundle loader", async () => {
    const warnings: string[] = [];
    await loadConfigFromFile(
      { command: "serve", mode: "test" },
      CONFIG_FILE,
      ROOT,
      "silent",
      warningRecorder(warnings),
    );
    expect(warnings.filter((message) => message.includes(NATIVE_LOADER_WARNING))).toEqual([]);
  });

  it("loads under the native config loader", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      CONFIG_FILE,
      ROOT,
      "silent",
      undefined,
      "native",
    );
    expect(loaded?.config).toBeDefined();
  });
});
