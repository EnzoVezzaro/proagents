/** Marketplace SPA types — mirror src/crew/types.ts and src/profiles/types.ts (kept in sync manually). */

/** Mirror of src/profiles/types.ts ProfileMcpServer. */
export interface ProfileMcpServer {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  allowedTools?: string[];
  healthCheck?: string;
  healthy?: boolean;
}

/** Mirror of src/profiles/types.ts ProfilePackage. */
export interface ProfilePackage {
  registry: string;
  reason?: string;
}

/**
 * Mirror of src/profiles/types.ts ProfileManifest — profile catalog items.
 * Catalog manifests in the folder standard hold section paths (identity is a
 * "identity/01-x.md" string, tools is "tools/requirements.md"); those are
 * hydrated client-side before rendering — see hydrateProfile in
 * profile-hydrate.ts.
 */
export interface ProfileManifest {
  version: string;
  profile: {
    name: string;
    slug: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
  identity: { title: string; summary?: string };
  expertise: string[];
  knowledge?: string[];
  methods?: string[];
  skills?: string[];
  skillsDetail?: Record<string, { skills: string[]; install?: string; note?: string }>;
  skillBodies?: Record<string, { description: string; body: string }>;
  rules?: string[];
  policies?: string[];
  standards?: string[];
  references?: Record<string, { url: string; note?: string }>;
  tools: {
    required: string[];
    optional?: string[];
    forbidden?: string[];
    mcp?: ProfileMcpServer[];
    packages?: ProfilePackage[];
  };
  verification: { required: string[]; optional?: string[] };
}

/**
 * On-disk/catalog manifest in the folder standard: sections hold .md paths;
 * hydration turns this into a plain ProfileManifest. Inline drafts (builder)
 * are a ProfileManifest with content instead of paths.
 */
export type ProfileManifestSource = Omit<ProfileManifest, "identity" | "tools"> & {
  identity?: ProfileManifest["identity"] | string;
  tools?: ProfileManifest["tools"] | string;
};

/** True when a section entry is a folder-standard .md path. */
export function isPathEntry(entry: string): boolean {
  return /^[\w./-]+\.md$/.test(entry) && !entry.includes("..") && !entry.startsWith("/") && !entry.startsWith("npm:") && !entry.startsWith("github:");
}

export interface CrewPermissions {
  read: "none" | "repo" | "scoped" | "world";
  write: "none" | "repo" | "scoped";
  production: "none" | "read" | "write";
  secrets: "none" | "named" | "all";
  tools: string[];
  approvalGates?: string[];
}

export interface CrewMcpServer {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  allowedTools?: string[];
}

export interface CrewContext {
  framework: string;
  scope?: string;
  options?: Record<string, unknown>;
}

export interface CrewWorker {
  id: string;
  name: string;
  role: string;
  description: string;
  /** Optional profession: slug of a Professional Profile this worker operates as. */
  profile?: string;
  permissions: CrewPermissions;
  mcpServers: string[];
  context: CrewContext[];
  instructions: string;
  receivesFrom: string[];
  emits: string[];
}

export interface CrewHandoff {
  from: string;
  to: string;
  artifact: string;
}

export interface CrewDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  workers: CrewWorker[];
  mcpServers: CrewMcpServer[];
  handoffs: CrewHandoff[];
  entryPoints: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CrewDefinitionSource {
  version: string;
  crew: {
    id: string;
    name: string;
    description: string;
    author: string;
    tags: string[];
  };
  /** Paths to worker.json manifests, or inline worker objects. */
  workers: string[] | CrewWorker[];
  /** Path to mcp/servers.json, or an inline list (legacy/builder). */
  mcp?: string;
  mcpServers?: CrewMcpServer[];
  /** Path to graph.json, or inline (legacy/builder). */
  graph?: string;
  handoffs?: CrewHandoff[];
  entryPoints?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MarketplaceItem {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  kind: "profile" | "crew" | "agent";
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceCatalog {
  schemaVersion: 1;
  updatedAt: string;
  items: MarketplaceItem[];
}

export function emptyCrew(author: string): CrewDefinition {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    version: "1.0.0",
    description: "",
    author,
    tags: [],
    workers: [],
    mcpServers: [],
    handoffs: [],
    entryPoints: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** Minimal ProfileManifest for new profile drafts (validator defaults fill the rest). */
export function emptyProfile(): ProfileManifest {
  return {
    version: "1.0.0",
    profile: { name: "", slug: "" },
    identity: { title: "" },
    expertise: [],
    tools: { required: ["filesystem", "shell", "git"], mcp: [], packages: [] },
    verification: { required: ["tests"] },
  };
}
