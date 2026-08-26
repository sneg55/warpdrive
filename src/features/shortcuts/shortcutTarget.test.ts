// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { isOverlayOpen, isTypingTarget } from "./shortcutTarget";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isTypingTarget", () => {
  test("is true for a text input", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
  });

  test("is true for a textarea", () => {
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
  });

  test("is true for a native select", () => {
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
  });

  test("is true for a contenteditable element (the rich-text composer)", () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    document.body.append(el);
    expect(isTypingTarget(el)).toBe(true);
  });

  test("is false for a plain div", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });

  test("is false for a button", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
  });

  test("is false for null", () => {
    expect(isTypingTarget(null)).toBe(false);
  });

  test("is true for a Radix select trigger, which uses printable keys for type-ahead", () => {
    const el = document.createElement("button");
    el.setAttribute("role", "combobox");
    document.body.append(el);
    expect(isTypingTarget(el)).toBe(true);
  });

  test("is true for an element inside a combobox trigger", () => {
    document.body.innerHTML = '<button role="combobox"><span id="inner">Open</span></button>';
    expect(isTypingTarget(document.querySelector("#inner"))).toBe(true);
  });

  test("is true for a spinbutton", () => {
    const el = document.createElement("div");
    el.setAttribute("role", "spinbutton");
    document.body.append(el);
    expect(isTypingTarget(el)).toBe(true);
  });
});

describe("isOverlayOpen", () => {
  test("is false on a bare document", () => {
    expect(isOverlayOpen(document)).toBe(false);
  });

  test("is true while a dialog is mounted", () => {
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(isOverlayOpen(document)).toBe(true);
  });

  test("is true while a dropdown menu is open", () => {
    document.body.innerHTML = '<div role="menu"></div>';
    expect(isOverlayOpen(document)).toBe(true);
  });

  test("is true while an alert dialog is mounted", () => {
    document.body.innerHTML = '<div role="alertdialog"></div>';
    expect(isOverlayOpen(document)).toBe(true);
  });

  test("is true while a Radix popper overlay is open", () => {
    document.body.innerHTML = "<div data-radix-popper-content-wrapper></div>";
    expect(isOverlayOpen(document)).toBe(true);
  });

  test("is false for an always-mounted inline listbox (the deal stage selector)", () => {
    // StageSelector renders role="listbox" inline on every deal workspace. Treating that as an
    // open overlay silently killed every shortcut on those pages.
    document.body.innerHTML = '<div role="listbox" aria-label="Stage"></div>';
    expect(isOverlayOpen(document)).toBe(false);
  });
});
