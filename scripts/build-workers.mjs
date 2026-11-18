import { build } from "esbuild";

const entries = [
  { in: "src/entrypoints/ws.ts", out: "dist/ws.mjs" },
  { in: "src/entrypoints/worker.ts", out: "dist/worker.mjs" },
  { in: "src/entrypoints/migrate.ts", out: "dist/migrate.mjs" },
  { in: "src/entrypoints/sweepSpam.ts", out: "dist/sweep-spam.mjs" },
];

await Promise.all(
  entries.map((entry) =>
    build({
      entryPoints: [entry.in],
      outfile: entry.out,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      packages: "external",
      logLevel: "info",
    }),
  ),
);
