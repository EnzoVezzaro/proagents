/** Marketplace SPA types — mirror src/crew/types.ts and src/profiles/types.ts (kept in sync manually). */

/** Mirror of src/profiles/types.ts ProfileManifest — profile catalog items. */
export interface ProfileManifest {
  version: string;
  profile: {
    name: string;
    slug: string;
    version: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
  identity: { title: string; summary?: string };
  expertise: string[];
  knowledge?: string[];
  methods?: string[];
  skills?: string[];
  rules?: string[];
  standards?: string[];
  tools: { required: string[]; optional?: string[]; forbidden?: string[] };
  verification: { required: string[]; optional?: string[] };
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
