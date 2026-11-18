import type { NextConfig } from "next";

export const CONSENT_PATH = "/oauth/authorize/consent";

const ALL_ROUTES_EXCEPT_CONSENT = "/((?!oauth/authorize/consent/?$).*)";

const BASE_CSP = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"];

const FORM_ACTION = "form-action 'self'";

function securityHeaders(directives: string[]): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: directives.join("; ") },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pg-boss", "@xdevplatform/chat-xdk-server", "juicebox-sdk"],
  headers() {
    return Promise.resolve([
      { source: CONSENT_PATH, headers: securityHeaders(BASE_CSP) },
      { source: ALL_ROUTES_EXCEPT_CONSENT, headers: securityHeaders([...BASE_CSP, FORM_ACTION]) },
    ]);
  },
  poweredByHeader: false,
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
    serverActions: { bodySizeLimit: "64mb" },
  },
};

export default nextConfig;
