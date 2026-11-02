const DOCS_URL = "https://docs.warpdrivecrm.com";

const SECTIONS = [
  { key: "", heading: "Getting started" },
  { key: "features", heading: "Features" },
  { key: "administration", heading: "Administration" },
  { key: "guides", heading: "Guides" },
  { key: "operations", heading: "Operations" },
];

function readFrontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  const fields = {};
  if (match === null) return fields;
  for (const line of match[1].split("\n")) {
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (pair === null) continue;
    fields[pair[1]] = pair[2].replace(/^"(.*)"$/, "$1");
  }
  return fields;
}

function firstHeading(source) {
  const match = /^# (.+)$/m.exec(source);
  return match === null ? "" : match[1].trim();
}

function urlFor(relPath, slug) {
  if (slug !== undefined) return `${DOCS_URL}${slug.endsWith("/") ? slug : `${slug}/`}`;
  return `${DOCS_URL}/${relPath.replace(/\.mdx?$/, "")}/`;
}

export function parseDoc(relPath, source) {
  const fields = readFrontmatter(source);
  const slash = relPath.indexOf("/");
  return {
    section: slash === -1 ? "" : relPath.slice(0, slash),
    position: fields.sidebar_position === undefined ? Number.POSITIVE_INFINITY : Number(fields.sidebar_position),
    title: fields.title ?? firstHeading(source),
    description: fields.description ?? "",
    url: urlFor(relPath, fields.slug),
  };
}

function byPositionThenTitle(a, b) {
  if (a.position !== b.position) return a.position - b.position;
  return a.title.localeCompare(b.title);
}

export function buildDocsLlmsTxt(docs) {
  const home = docs.find((doc) => doc.url === `${DOCS_URL}/`);
  const lines = ["# Warpdrive documentation", ""];
  if (home !== undefined) lines.push(`> ${home.description}`, "");
  lines.push(`Product site: https://warpdrivecrm.com (overview at https://warpdrivecrm.com/llms.txt)`);
  const known = new Set(SECTIONS.map((section) => section.key));
  const extra = [...new Set(docs.map((doc) => doc.section))]
    .filter((key) => !known.has(key))
    .sort()
    .map((key) => ({ key, heading: key.charAt(0).toUpperCase() + key.slice(1) }));
  for (const section of [...SECTIONS, ...extra]) {
    const entries = docs.filter((doc) => doc.section === section.key).sort(byPositionThenTitle);
    if (entries.length === 0) continue;
    lines.push("", `## ${section.heading}`, "");
    for (const doc of entries) lines.push(`- [${doc.title}](${doc.url}): ${doc.description}`);
  }
  return `${lines.join("\n")}\n`;
}
