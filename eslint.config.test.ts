import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";

describe("eslint custom rules", () => {
  test("flags raw process.env outside the env boundary", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText("export const x = process.env.SECRET;\n", {
      filePath: "src/features/demo/leak.ts",
    });
    const messages = results[0]!.messages.map((m) => m.message).join(" ");
    expect(messages).toContain("Read env only via src/config/env.ts");
  });

  test("does NOT flag process.env inside src/config/env.ts", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText("export const x = process.env.SECRET;\n", {
      filePath: "src/config/env.ts",
    });
    const envMessages = results[0]!.messages
      .filter((m) => m.message.includes("Read env only via"))
      .map((m) => m.message);
    expect(envMessages).toHaveLength(0);
  });

  test("flags raw throw new Error in app code", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText("export function f(): void { throw new Error('x'); }\n", {
      filePath: "src/features/demo/boom.ts",
    });
    const messages = results[0]!.messages.map((m) => m.message).join(" ");
    expect(messages).toContain("Throw AppError");
  });

  test("does NOT flag throw new Error in src/types/result.ts", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText(
      "export function assertNever(x: never): never { throw new Error('Unexpected value'); }\n",
      { filePath: "src/types/result.ts" },
    );
    const syntaxMessages = results[0]!.messages
      .filter((m) => m.message.includes("Throw AppError"))
      .map((m) => m.message);
    expect(syntaxMessages).toHaveLength(0);
  });

  test("does NOT flag throw new Error in src/config/env.ts", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText(
      "export function loadOrThrow(): never { throw new Error('Invalid environment'); }\n",
      { filePath: "src/config/env.ts" },
    );
    const syntaxMessages = results[0]!.messages
      .filter((m) => m.message.includes("Throw AppError"))
      .map((m) => m.message);
    expect(syntaxMessages).toHaveLength(0);
  });

  test("does NOT flag throw new Error in test files", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText("test('x', () => { throw new Error('fail'); });\n", {
      filePath: "src/features/demo/boom.test.ts",
    });
    const syntaxMessages = results[0]!.messages
      .filter((m) => m.message.includes("Throw AppError"))
      .map((m) => m.message);
    expect(syntaxMessages).toHaveLength(0);
  });

  test("flags fetch() call without a signal argument", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText(
      "export async function f() { return fetch('https://example.com/api'); }\n",
      { filePath: "src/features/demo/call.ts" },
    );
    const messages = results[0]!.messages.map((m) => m.message).join(" ");
    expect(messages).toContain("fetch() must pass { signal }");
  });

  test("does NOT flag fetch() called with a second (options) argument", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText(
      "export async function f(s: AbortSignal) { return fetch('https://example.com/api', { signal: s }); }\n",
      { filePath: "src/features/demo/call.ts" },
    );
    const fetchMessages = results[0]!.messages
      .filter((m) => m.message.includes("fetch() must pass { signal }"))
      .map((m) => m.message);
    expect(fetchMessages).toHaveLength(0);
  });

  test("import-x/no-cycle rule is configured as error", async () => {
    const eslint = new ESLint();
    const config = await eslint.calculateConfigForFile("src/features/demo/a.ts");
    // ESLint stores severity as a number: 0=off, 1=warn, 2=error
    const rules = config.rules as Record<string, [number, ...unknown[]] | number | undefined>;
    const cycleEntry = rules["import-x/no-cycle"];
    expect(cycleEntry).toBeDefined();
    const severity = Array.isArray(cycleEntry) ? cycleEntry[0] : cycleEntry;
    expect(severity).toBe(2); // 2 = "error"
  });

  test("import-x/no-unresolved rule is present (off by design; TypeScript handles resolution)", async () => {
    const eslint = new ESLint();
    const config = await eslint.calculateConfigForFile("src/features/demo/a.ts");
    const rules = config.rules as Record<string, [number, ...unknown[]] | number | undefined>;
    const unresolvedEntry = rules["import-x/no-unresolved"];
    // Rule must be explicitly configured (off is intentional per brief: TS catches these)
    expect(unresolvedEntry).toBeDefined();
    const severity = Array.isArray(unresolvedEntry) ? unresolvedEntry[0] : unresolvedEntry;
    expect(typeof severity).toBe("number"); // 0=off, 1=warn, 2=error
  });
});
