import { REPO_URL } from "./urls";

export const LANDING_SELF_HOST = {
  heading: "One box. docker compose up.",
  body: "The whole topology ships as a single Docker Compose file: app, WebSocket server, background worker, Postgres, and Garage for file storage, with Caddy provisioning HTTPS for your domain automatically. Databases and storage stay on the internal network.",
  prerequisites:
    "You need a Linux box with Docker, a domain and an s3. subdomain pointed at it, ports 80 and 443 open, and a Google Workspace OAuth client.",
  bullets: [
    "Google Workspace SSO and Gmail OAuth: your accounts, your consent screen",
    "Postgres LISTEN/NOTIFY realtime, no paid pub-sub",
    "Garage or any S3-compatible store for files",
  ],
  code: [
    { text: `git clone ${REPO_URL}.git && cd warpdrive`, comment: null },
    { text: "cp .env.example .env", comment: "domain, Google OAuth, secrets" },
    { text: "docker compose up -d --build", comment: null },
  ],
  copy: "Copy commands",
  copied: "Copied",
  copyFailed: "Copy failed, select the text instead",
  stackLabel: "Built on",
  stack: ["Next.js", "React", "TypeScript", "Postgres", "Drizzle", "tRPC", "Tailwind", "shadcn/ui"],
} as const;
