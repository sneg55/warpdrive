import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDocsLlmsTxt, parseDoc } from "./llmsTxt.mjs";

const PIPELINE = `---
sidebar_position: 1
title: Pipeline
description: "The kanban board: stages, weighted totals, and rotting deals."
---

# Pipeline
`;

const INTRO = `---
sidebar_position: 1
slug: /
title: Introduction
description: "Warpdrive is an open-source, self-hosted CRM."
---
`;

describe("parseDoc", () => {
  it("reads the title and description and maps the path to its trailing-slash URL", () => {
    assert.deepEqual(parseDoc("features/pipeline.md", PIPELINE), {
      section: "features",
      position: 1,
      title: "Pipeline",
      description: "The kanban board: stages, weighted totals, and rotting deals.",
      url: "https://docs.warpdrivecrm.com/features/pipeline/",
    });
  });

  it("honours a slug override", () => {
    assert.equal(parseDoc("intro.md", INTRO).url, "https://docs.warpdrivecrm.com/");
  });

  it("files a top-level doc under getting started", () => {
    assert.equal(parseDoc("intro.md", INTRO).section, "");
  });

  it("falls back to the first heading when frontmatter has no title", () => {
    const doc = parseDoc("guides/x.md", "---\ndescription: d\n---\n\n# From heading\n");
    assert.equal(doc.title, "From heading");
  });
});

describe("buildDocsLlmsTxt", () => {
  const docs = [parseDoc("features/pipeline.md", PIPELINE), parseDoc("intro.md", INTRO)];
  const text = buildDocsLlmsTxt(docs);

  it("opens with the docs title and the introduction's summary", () => {
    const [title, blank, summary] = text.split("\n");
    assert.equal(title, "# Warpdrive documentation");
    assert.equal(blank, "");
    assert.equal(summary, "> Warpdrive is an open-source, self-hosted CRM.");
  });

  it("keeps a doc from a folder it has no heading for", () => {
    const extra = parseDoc("reference/api.md", "---\ntitle: API\ndescription: d\n---\n");
    assert.ok(buildDocsLlmsTxt([...docs, extra]).includes("## Reference\n\n- [API]"));
  });

  it("lists getting started before features, each doc as a described link", () => {
    assert.ok(text.indexOf("## Getting started") < text.indexOf("## Features"));
    assert.ok(
      text.includes(
        "- [Pipeline](https://docs.warpdrivecrm.com/features/pipeline/): The kanban board: stages, weighted totals, and rotting deals.",
      ),
    );
  });
});
