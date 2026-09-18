// One-off: add catalog index entries for profiles that moved from profiles/ into
// .marketplace/items. Deterministic — derives every field from the manifest.
import fs from "node:fs";
import path from "node:path";

const catalogPath = ".marketplace/catalog.json";
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const items = fs.readdirSync(".marketplace/items", { withFileTypes: true });
for (const e of items) {
  if (!e.isDirectory()) continue;
  const mf = path.join(".marketplace/items", e.name, "profile.json");
  if (!fs.existsSync(mf)) continue;
  if (catalog.items.some((i) => i.id === e.name)) continue;
  const m = JSON.parse(fs.readFileSync(mf, "utf8"));
  const createdAt = new Date(0).toISOString();
  catalog.items.push({
    id: m.profile.slug,
    name: m.profile.name,
    version: m.version,
    description: m.profile.description ?? "",
    author: m.profile.author ?? "proagents",
    tags: ["profile", ...(m.profile.tags ?? [])],
    kind: "profile",
    downloads: 0,
    createdAt,
    updatedAt: new Date(0).toISOString(),
  });
}
catalog.items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
catalog.updatedAt = new Date(0).toISOString();
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log("catalog items:", catalog.items.length);
