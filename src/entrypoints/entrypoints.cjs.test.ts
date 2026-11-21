import { build } from "esbuild";
import { expect, it } from "vitest";

const entrypoints = ["migrate.ts", "sweepSpam.ts", "worker.ts", "ws.ts"];

it.each(
  entrypoints,
)("%s compiles to CommonJS so tsx can run it without type: module", async (entrypoint) => {
  const result = await build({
    entryPoints: [new URL(`./${entrypoint}`, import.meta.url).pathname],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    packages: "external",
    write: false,
    logLevel: "silent",
  });
  expect(result.outputFiles?.length).toBeGreaterThan(0);
});
