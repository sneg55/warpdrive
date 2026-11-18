import { describe, expect, it, vi } from "vitest";

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
    expect(tree.props.className).toContain("antialiased");
  });
});
