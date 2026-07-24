import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SETTINGS_DIR = fileURLToPath(new URL("./", import.meta.url));
const FORMAT_TOOLBAR = fileURLToPath(
  new URL("../../../features/email/composer/FormatToolbar.tsx", import.meta.url),
);
const FORMAT_TOOLBAR_CONTROLS = fileURLToPath(
  new URL("../../../features/email/composer/FormatToolbarControls.tsx", import.meta.url),
);
const INSERT_URL_DIALOG = fileURLToPath(
  new URL("../../../features/email/composer/InsertUrlDialog.tsx", import.meta.url),
);
const AVATAR_UPLOAD = fileURLToPath(
  new URL("../../../features/identity/avatar/AvatarUpload.tsx", import.meta.url),
);
const SHARED_SETTINGS_CONTROLS = [FORMAT_TOOLBAR, FORMAT_TOOLBAR_CONTROLS, INSERT_URL_DIALOG];

interface SourceFile {
  path: string;
  source: string;
}

function productionTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...productionTsxFiles(path));
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) files.push(path);
  }
  return files;
}

function relative(path: string): string {
  return path.replace(`${SETTINGS_DIR}/`, "");
}

function rawInputTags(source: string): string[] {
  return source.match(/<input\b[^>]*>/gs) ?? [];
}

function isNativeFileInput(tag: string): boolean {
  return /\btype\s*=\s*["']file["']/i.test(tag);
}

function rawInputOffenders(files: SourceFile[], nativeFileControls: ReadonlySet<string>): string[] {
  return files
    .filter(({ path, source }) =>
      rawInputTags(source).some((tag) => !(nativeFileControls.has(path) && isNativeFileInput(tag))),
    )
    .map(({ path }) => path);
}

describe("settings design-system conformance", () => {
  const settingsFiles = productionTsxFiles(SETTINGS_DIR);

  it("uses Button-based controls instead of bare button elements", () => {
    const offenders = [...settingsFiles, ...SHARED_SETTINGS_CONTROLS, AVATAR_UPLOAD]
      .filter((path) => readFileSync(path, "utf8").includes("<button"))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it("uses Input for text entry while preserving the two native file inputs", () => {
    const nativeFileControls = new Set([`${SETTINGS_DIR}/import/UploadStep.tsx`, AVATAR_UPLOAD]);
    const sources = [...settingsFiles, ...SHARED_SETTINGS_CONTROLS, AVATAR_UPLOAD].map((path) => ({
      path,
      source: readFileSync(path, "utf8"),
    }));
    const offenders = rawInputOffenders(sources, nativeFileControls).map(relative);
    expect(offenders).toEqual([]);
    const nativeFileInputPaths = sources
      .flatMap(({ path, source }) =>
        rawInputTags(source)
          .filter(isNativeFileInput)
          .map(() => path),
      )
      .sort();
    expect(nativeFileInputPaths).toEqual([...nativeFileControls].sort());
  });

  it("rejects a raw text input placed beside an allowlisted file input", () => {
    const offenders = rawInputOffenders(
      [{ path: AVATAR_UPLOAD, source: '<input type="file" /><input type="text" />' }],
      new Set([AVATAR_UPLOAD]),
    );
    expect(offenders).toEqual([AVATAR_UPLOAD]);
  });

  it("does not use browser prompts or native color inputs in the shared settings editor", () => {
    const source = SHARED_SETTINGS_CONTROLS.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toContain("window.prompt");
    expect(source).not.toMatch(/<input[^>]+type=["']color["']/s);
  });
});
