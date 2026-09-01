import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import type { ClientError } from "./actionResult";

const SRC_DIR = fileURLToPath(new URL("../", import.meta.url));

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) files.push(...sourceFiles(`${path}/`));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) files.push(path);
  }
  return files;
}

function isServerActionModule(source: string): boolean {
  return /^\s*(["'])use server\1;/.test(source);
}

function closingParen(source: string, signatureStart: number): number {
  let depth = 0;
  for (let i = source.indexOf("(", signatureStart); i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

function bodyStart(source: string, from: number): number {
  let angle = 0;
  let brace = 0;
  for (let i = from; i < source.length; i += 1) {
    const char = source[i];
    if (char === "<") angle += 1;
    else if (char === ">" && source[i - 1] !== "=") angle -= 1;
    else if (char === "}") brace -= 1;
    else if (char === "{") {
      if (angle === 0 && brace === 0) return i;
      brace += 1;
    }
  }
  return source.length;
}

function returnAnnotation(source: string, signatureStart: number): string {
  const close = closingParen(source, signatureStart);
  return source.slice(close + 1, bodyStart(source, close + 1));
}

function actionsExposingAppError(source: string): string[] {
  const leaking: string[] = [];
  for (const match of source.matchAll(/^export (?:async )?function (\w+)\s*\(/gm)) {
    const name = match[1];
    if (name === undefined) continue;
    if (returnAnnotation(source, match.index).includes("AppError")) leaking.push(name);
  }
  return leaking;
}

describe("server action failure shape", () => {
  it("never returns an AppError across the React boundary", () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(SRC_DIR)) {
      const source = readFileSync(path, "utf8");
      if (!isServerActionModule(source)) continue;
      for (const name of actionsExposingAppError(source)) {
        offenders.push(`${path.replace(SRC_DIR, "")}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("ClientError", () => {
  it("rejects an AppError, so a missed conversion is a type error rather than a lost id", () => {
    const appError = new AppError("E_PERM_001", "denied", {});
    // @ts-expect-error AppError declares message; ClientError forbids it
    const clientError: ClientError = appError;
    expect(clientError.id).toBe("E_PERM_001");
  });
});
