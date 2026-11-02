import { LANDING_STRINGS } from "@/constants/landingStrings";
import { pageUrl } from "@/constants/siteMetadata";
import { HOME_PAGE, SITE_PAGES } from "@/constants/sitePages";
import { OPENALTERNATIVE_URL } from "@/constants/structuredData";
import { DOCS_URL } from "@/constants/urls";
import type { ReleaseFacts } from "@/types/repoFacts";

const KEY_DOCS = [
  { title: "Installation", path: "/setup/", note: "Deploy with Docker Compose on one box" },
  { title: "MCP server", path: "/features/mcp/", note: "Connect Claude, ChatGPT, or Cursor" },
  {
    title: "Migrating from Pipedrive",
    path: "/guides/migrating-from-pipedrive/",
    note: "Import Pipedrive CSV exports in order",
  },
] as const;

export function buildLlmsTxt(release: ReleaseFacts | null): string {
  const lines: string[] = [
    "# Warpdrive",
    "",
    `> ${HOME_PAGE.description}`,
    "",
    LANDING_STRINGS.hero.subtitle,
    "",
  ];
  if (release !== null) {
    lines.push(`Latest release: v${release.version} (${release.releasedOn})`, "");
  }
  lines.push("## Pages", "");
  for (const page of SITE_PAGES) {
    lines.push(`- [${page.title}](${pageUrl(page.path)}): ${page.description}`);
  }
  lines.push("", "## Docs", "", `- [Documentation index](${DOCS_URL}/llms.txt): every docs page`);
  for (const doc of KEY_DOCS) {
    lines.push(`- [${doc.title}](${DOCS_URL}${doc.path}): ${doc.note}`);
  }
  lines.push(
    "",
    "## Source",
    "",
    `- [GitHub repository](${LANDING_STRINGS.hero.ctaHref}): MIT-licensed source code and releases`,
    `- [OpenAlternative listing](${OPENALTERNATIVE_URL})`,
    "",
    "## FAQ",
  );
  for (const item of LANDING_STRINGS.faq.items) {
    lines.push("", `### ${item.q}`, "", item.a);
  }
  return `${lines.join("\n")}\n`;
}
