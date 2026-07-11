import { describe, expect, it, vi } from "vitest";

// next/font/local is compiled by the Next.js build loader and cannot run under Vitest, so we stub
// it. The stub returns a sentinel `variable` class; the layout must apply that class to the document
// root so Tailwind's `--font-sans` resolves to Inter. This asserts the WIRING (font var is attached),
// which is the part that silently breaks, not the font bytes.
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "__inter_sentinel_var", className: "__inter_sentinel_class" }),
}));
vi.mock("@/components/providers", () => ({
  Providers: ({ children }: { children: React.ReactNode }) => children,
}));

describe("root layout", () => {
  it("applies the Inter font variable class to the document root", async () => {
    const { default: RootLayout } = await import("./layout");
    const tree = RootLayout({ children: null }) as { props: { className?: string } };
    expect(tree.props.className).toContain("__inter_sentinel_var");
    // Keeps the existing antialiasing hint.
    expect(tree.props.className).toContain("antialiased");
  });
});
