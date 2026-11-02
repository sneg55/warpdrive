import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocsLlmsTxt, parseDoc } from "./llmsTxt.mjs";

const siteRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docsDir = path.join(siteRoot, "docs");
const outFile = path.join(siteRoot, "build", "llms.txt");

const entries = await readdir(docsDir, { recursive: true });
const docFiles = entries.filter((entry) => /\.mdx?$/.test(entry));
const docs = await Promise.all(
  docFiles.map(async (relPath) =>
    parseDoc(relPath.split(path.sep).join("/"), await readFile(path.join(docsDir, relPath), "utf8")),
  ),
);
await writeFile(outFile, buildDocsLlmsTxt(docs));
console.warn(`llms.txt: ${docs.length} docs written to ${path.relative(siteRoot, outFile)}`);
