import { ESLint } from "eslint";
import { beforeAll, describe, expect, test } from "vitest";

const RULE_ID = "warpdrive/no-comments";
const TS = "src/features/demo/comments.ts";
const TSX = "src/features/demo/comments.tsx";
const MJS = "scripts/comments-demo.mjs";
const VITEST_ENV = `@vitest-${"environment"}`;

const eslint = new ESLint();

beforeAll(async () => {
  await eslint.lintText("export const a = 1;\n", { filePath: TS });
}, 180_000);

async function noCommentFindings(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const messages = result?.messages ?? [];
  expect(messages.filter((m) => m.fatal === true).map((m) => m.message)).toEqual([]);
  return messages.filter((m) => m.ruleId === RULE_ID).map((m) => m.message);
}

const REJECTED: [string, string, string][] = [
  ["a line comment", "// explains the constant\nexport const a = 1;\n", TS],
  ["a block comment", "/* explains the constant */\nexport const a = 1;\n", TS],
  ["a JSDoc comment", "/** Explains the function. */\nexport function f(): void {}\n", TS],
  ["a trailing comment", "export const a = 1; // trailing note\n", TS],
  [
    "a JSX comment",
    "export function C() {\n  return <div>{/* explains the div */}</div>;\n}\n",
    TSX,
  ],
  [
    "prose that mentions biome-ignore",
    "// the per-site `biome-ignore` explains the avatars\nexport const a = 1;\n",
    TS,
  ],
  [
    "prose that mentions the vitest environment pragma",
    `// Per-file overrides via ${VITEST_ENV} docblock\nexport const a = 1;\n`,
    TS,
  ],
  [
    "an eslint directive carrying a description",
    "const xs: string[] = [];\n// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known present\nexport const a = xs[0]!;\n",
    TS,
  ],
  ["a JSDoc @type annotation in a .ts file", "/** @type {number} */\nexport const a = 1;\n", TS],
  ["a plain JSDoc block in a .mjs file", "/** Explains the value. */\nexport const a = 1;\n", MJS],
];

const ACCEPTED: [string, string, string][] = [
  [
    "eslint-disable-next-line",
    "const xs: string[] = [];\n// eslint-disable-next-line @typescript-eslint/no-non-null-assertion\nexport const a = xs[0]!;\n",
    TS,
  ],
  [
    "eslint-disable-line",
    "const xs: string[] = [];\nexport const a = xs[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion\n",
    TS,
  ],
  [
    "eslint-disable and eslint-enable blocks",
    "/* eslint-disable @typescript-eslint/no-non-null-assertion */\nconst xs: string[] = [];\nexport const a = xs[0]!;\n/* eslint-enable @typescript-eslint/no-non-null-assertion */\n",
    TS,
  ],
  [
    "@ts-expect-error",
    "// @ts-expect-error the literal is deliberately the wrong type\nexport const a: number = 'x';\n",
    TS,
  ],
  ["@ts-ignore", "// @ts-ignore\nexport const a: number = 'x';\n", TS],
  ["@ts-nocheck", "// @ts-nocheck\nexport const a = 1;\n", TS],
  ["@ts-check", "// @ts-check\nexport const a = 1;\n", MJS],
  [
    "a line biome-ignore",
    "// biome-ignore lint/suspicious/noExplicitAny: fixture\nexport const a: unknown = 1;\n",
    TS,
  ],
  [
    "a JSX biome-ignore",
    "export function C() {\n  return (\n    <div>\n      {/* biome-ignore lint/a11y/useSemanticElements: grid row */}\n      <div role='row' />\n    </div>\n  );\n}\n",
    TSX,
  ],
  ["a line vitest environment pragma", `// ${VITEST_ENV} jsdom\nexport const a = 1;\n`, TS],
  ["a docblock vitest environment pragma", `/** ${VITEST_ENV} node */\nexport const a = 1;\n`, TS],
  ["a triple-slash reference", '/// <reference types="node" />\nexport const a = 1;\n', TS],
  ["a c8 ignore pragma", "/* c8 ignore next */\nexport const a = 1;\n", TS],
  ["a v8 ignore pragma", "/* v8 ignore next */\nexport const a = 1;\n", TS],
  ["an istanbul ignore pragma", "/* istanbul ignore next */\nexport const a = 1;\n", TS],
  [
    "a webpackChunkName magic comment",
    'export const m = () => import(/* webpackChunkName: "demo" */ "./demo");\n',
    TS,
  ],
  [
    "a @vite-ignore magic comment",
    "export const m = (p: string) => import(/* @vite-ignore */ p);\n",
    TS,
  ],
  [
    "a turbopackIgnore magic comment",
    "export const m = (p: string) => import(/* turbopackIgnore: true */ p);\n",
    TS,
  ],
  ["@jsxImportSource", "/** @jsxImportSource react */\nexport const a = 1;\n", TSX],
  ["a JSDoc @type annotation in .mjs", "/** @type {number} */\nexport const a = 1;\n", MJS],
  ["a JSDoc @typedef in .mjs", "/** @typedef {{ a: number }} Pair */\nexport const a = 1;\n", MJS],
  [
    "a JSDoc @satisfies in .mjs",
    "export const a = /** @satisfies {Record<string, number>} */ ({ x: 1 });\n",
    MJS,
  ],
  ["a shebang in .ts", "#!/usr/bin/env node\nexport const a = 1;\n", TS],
  ["a shebang in .mjs", "#!/usr/bin/env node\nexport const a = 1;\n", MJS],
];

describe("warpdrive/no-comments", () => {
  test.each(REJECTED)("rejects %s", async (_name, code, filePath) => {
    expect(await noCommentFindings(code, filePath)).toHaveLength(1);
  });

  test.each(ACCEPTED)("accepts %s", async (_name, code, filePath) => {
    expect(await noCommentFindings(code, filePath)).toEqual([]);
  });

  test("is wired as an error for app, script and root config files", async () => {
    for (const filePath of [TS, TSX, MJS, "eslint.config.mjs", "vitest.config.mts"]) {
      const config = (await eslint.calculateConfigForFile(filePath)) as {
        rules: Record<string, unknown>;
      };
      const entry = config.rules[RULE_ID];
      expect(Array.isArray(entry) ? entry[0] : entry).toBe(2);
    }
  });
});
