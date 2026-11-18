import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { expect, it } from "vitest";

const GLOBALS = fileURLToPath(new URL("./globals.css", import.meta.url));
const TAILWIND_ENTRY = fileURLToPath(
  new URL("../../node_modules/tailwindcss/index.css", import.meta.url),
);

async function buildUtilities(candidates: string[]): Promise<string> {
  const compiled = await compile(await readFile(GLOBALS, "utf8"), {
    base: fileURLToPath(new URL("./", import.meta.url)),
    async loadStylesheet(id, base) {
      if (id === "tailwindcss") {
        return { path: id, base, content: await readFile(TAILWIND_ENTRY, "utf8") };
      }
      return { path: id, base, content: "" };
    },
  });
  return compiled.build(candidates);
}

function ruleFor(css: string, className: string): string {
  const selector = `.${className.replace(/[:./[\]]/g, (c) => `\\${c}`)}`;
  const start = css.indexOf(selector);
  expect(start, `${selector} was not emitted`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return css.slice(start);
}

it("gates dark: utilities on the .dark class, not on the OS color scheme", async () => {
  const css = await buildUtilities(["dark:bg-blue-950/40", "dark:text-blue-300"]);

  for (const utility of ["dark:bg-blue-950/40", "dark:text-blue-300"]) {
    const rule = ruleFor(css, utility);
    expect(rule).not.toContain("prefers-color-scheme");
    expect(rule).toContain(".dark");
  }
});
