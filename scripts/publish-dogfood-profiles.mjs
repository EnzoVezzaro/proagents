import fs from "node:fs/promises";
import path from "node:path";

const SRC = "/tmp/profiles";
const ITEMS = path.resolve(".marketplace/items");
const CATALOG = path.resolve(".marketplace/catalog.json");

// Reader-facing one-liners for the catalog (derived from each profile's summary).
const DESCRIPTIONS = {
  "api-designer": "Professional profile: API contract design, versioning and deprecation strategy, and error models — treats every endpoint as a public commitment.",
  "code-reviewer": "Professional profile: correctness analysis, API/schema review and test-adequacy assessment — reviews the change, not the author.",
  "data-engineer": "Professional profile: batch and streaming pipeline design, warehouse modeling and data-quality enforcement — schemas as contracts, idempotency as default.",
  "developer-experience-engineer": "Professional profile: onboarding automation, local dev environment design and inner-source tooling — friction measured in minutes-to-first-PR.",
  "legacy-modernizer": "Professional profile: strangler-fig migrations, characterization testing and dependency retirement — safety net first, big-bang rewrites never.",
  "ml-engineer": "Professional profile: training pipeline design, evaluation methodology and feature engineering — baselines before metrics, versioned artifacts always.",
  "mobile-engineer": "Professional profile: offline-first architecture, release engineering and performance budgets — designed for the worst network and the oldest device.",
  "platform-engineer": "Professional profile: internal developer platforms, CI/CD architecture and multi-tenant isolation — paved roads with documented escape hatches.",
  "technical-writer": "Professional profile: API documentation, architecture explainers and onboarding guides — written for the reader under pressure, examples over abstraction.",
  "test-automator": "Professional profile: test pyramid architecture, flake diagnosis and fixture design — signal per minute of CI, tests that fail for exactly one reason.",
};

const manifests = [];
for (const file of (await fs.readdir(SRC)).sort()) {
  if (!file.endsWith(".json")) continue;
  const m = JSON.parse(await fs.readFile(path.join(SRC, file), "utf8"));
  const slug = m.profile.slug;
  m.profile.description = DESCRIPTIONS[slug];
  m.profile.author = "proagents";
  if (!("knowledge" in m)) m.knowledge = [];
  const out = path.join(ITEMS, `${slug}.json`);
  await fs.writeFile(out, JSON.stringify(m, null, 2) + "\n");
  manifests.push({ slug, name: m.profile.name ?? m.identity.title, version: m.version });
  console.log("wrote", out);
}

const catalog = JSON.parse(await fs.readFile(CATALOG, "utf8"));
const now = new Date().toISOString();
for (const { slug, name, version } of manifests) {
  const existing = catalog.items.find((i) => i.id === slug);
  const m = JSON.parse(await fs.readFile(path.join(ITEMS, `${slug}.json`), "utf8"));
  const item = {
    id: slug,
    name,
    version,
    description: m.profile.description,
    author: m.profile.author,
    tags: ["profile", ...(m.profile.tags ?? [])],
    kind: "profile",
    downloads: existing?.downloads ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  catalog.items = [...catalog.items.filter((i) => i.id !== slug), item];
}
catalog.items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
catalog.updatedAt = now;
await fs.writeFile(CATALOG, JSON.stringify(catalog, null, 2) + "\n");
console.log(`catalog now has ${catalog.items.length} items`);
