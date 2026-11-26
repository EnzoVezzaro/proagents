import { describe, expect, it } from "vitest";
import {
  serializeSpecYaml,
  validateSpecClient,
  deriveCapabilities,
  toggleIn,
} from "./project-spec.js";
import type { MarketplaceItem, SpecDocument } from "./types.js";

/**
 * PROJECT-SPEC — the pure client-side core of the Studio Build flow:
 * canonical serialization (byte-stable), client-side PA501/PA502/PA505
 * validation over the catalog, intent → capability suggestions.
 */

function item(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: "x",
    name: "X",
    version: "1.0.0",
    description: "d",
    author: "a",
    tags: [],
    kind: "profile",
    downloads: 0,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const baseSpec: SpecDocument = {
  schema: "proagents/v1",
  project: { name: "my-project" },
  environment: {},
};

describe("serializeSpecYaml (PROJECT-SPEC-SER)", () => {
  it("PROJECT-SPEC-SER-001: emits canonical sections in fixed order", () => {
    const yaml = serializeSpecYaml({
      ...baseSpec,
      environment: { capabilities: ["b-cap", "a-cap"], profiles: ["zeta", "alpha"] },
    });
    const lines = yaml.split("\n");
    expect(lines[0]).toBe("schema: proagents/v1");
    expect(lines[1]).toBe("project:");
    expect(lines[2]).toBe("  name: my-project");
    expect(lines.indexOf("environment:")).toBe(3);
    // profiles before capabilities (CANON_ORDER), lists sorted
    expect(lines.indexOf("  profiles:")).toBeLessThan(lines.indexOf("  capabilities:"));
    expect(yaml).toContain("    - alpha\n    - zeta");
    expect(yaml).toContain("    - a-cap\n    - b-cap");
  });

  it("PROJECT-SPEC-SER-002: dedupes and sorts; empty sections are omitted", () => {
    const yaml = serializeSpecYaml({
      ...baseSpec,
      environment: { profiles: ["b", "a", "b"], crews: [] },
    });
    expect(yaml.match(/- b/g)?.length).toBe(1);
    expect(yaml).not.toContain("crews:");
  });

  it("PROJECT-SPEC-SER-003: same intent, same bytes (determinism)", () => {
    const specA: SpecDocument = { ...baseSpec, environment: { profiles: ["x", "y"], capabilities: ["c1"] } };
    const specB: SpecDocument = { ...baseSpec, environment: { capabilities: ["c1"], profiles: ["y", "x"] } };
    expect(serializeSpecYaml(specA)).toBe(serializeSpecYaml(specB));
  });

  it("PROJECT-SPEC-SER-004: serializes policies and harness targets", () => {
    const yaml = serializeSpecYaml({
      ...baseSpec,
      environment: {},
      policies: { filesystem: { "workspace-only": true }, network: { allowed: ["github.com"] } },
      harness: { mode: "compatible", compatibility: ["codex", "opencode"] },
    });
    expect(yaml).toContain("policies:");
    expect(yaml).toContain("    workspace-only: true");
    expect(yaml).toContain("      - github.com");
    expect(yaml).toContain("harness:");
    expect(yaml).toContain("  mode: compatible");
    expect(yaml).toContain("    - codex");
  });
});

describe("validateSpecClient (PROJECT-SPEC-VAL)", () => {
  it("PROJECT-SPEC-VAL-001: PA501 on an empty project name", () => {
    const findings = validateSpecClient({ ...baseSpec, project: { name: "  " } }, []);
    expect(findings.some((f) => f.code === "PA501")).toBe(true);
  });

  it("PROJECT-SPEC-VAL-002: PA502 warning for a capability no catalog item provides", () => {
    const catalog = [item({ id: "p1", provides: ["browser-automation"] })];
    const findings = validateSpecClient(
      { ...baseSpec, environment: { capabilities: ["browser-automation", "quantum-crypto"] } },
      catalog,
    );
    const pa502 = findings.filter((f) => f.code === "PA502");
    expect(pa502.length).toBe(1);
    expect(pa502[0]!.message).toContain("quantum-crypto");
    expect(pa502[0]!.severity).toBe("warning"); // federated sources may still provide it
  });

  it("PROJECT-SPEC-VAL-003: no PA502 when the catalog provides the capability", () => {
    const catalog = [item({ id: "p1", provides: ["browser-automation"] })];
    const findings = validateSpecClient(
      { ...baseSpec, environment: { capabilities: ["browser-automation"] } },
      catalog,
    );
    expect(findings.some((f) => f.code === "PA502")).toBe(false);
  });

  it("PROJECT-SPEC-VAL-004: PA505 when an artifact excludes every harness target", () => {
    const catalog = [
      item({ id: "p1", kind: "profile", compatibility: ["claude-code"] }),
    ];
    const findings = validateSpecClient(
      {
        ...baseSpec,
        environment: { profiles: ["p1"] },
        harness: { mode: "compatible", compatibility: ["codex"] },
      },
      catalog,
    );
    expect(findings.some((f) => f.code === "PA505" && f.message.includes("p1"))).toBe(true);
  });

  it("PROJECT-SPEC-VAL-005: capabilities section is exempt from PA505", () => {
    const findings = validateSpecClient(
      {
        ...baseSpec,
        environment: { capabilities: ["anything"] },
        harness: { mode: "compatible", compatibility: ["codex"] },
      },
      [],
    );
    expect(findings.some((f) => f.code === "PA505")).toBe(false);
  });
});

describe("deriveCapabilities (PROJECT-SPEC-DER)", () => {
  const taxonomy = [
    { id: "browser-automation", title: "Browser Automation", description: "Drive a browser" },
    { id: "database-access", title: "Database Access", description: "Postgres, MySQL" },
    { id: "testing", title: "Testing", description: "Tests" },
  ];

  it("PROJECT-SPEC-DER-001: matches intent words against titles", () => {
    const hits = deriveCapabilities("Build a SaaS with automated browser testing", taxonomy);
    expect(hits.map((h) => h.id)).toContain("browser-automation");
    expect(hits.map((h) => h.id)).toContain("testing");
  });

  it("PROJECT-SPEC-DER-002: deterministic ordering by score then id", () => {
    const a = deriveCapabilities("browser testing", taxonomy);
    const b = deriveCapabilities("testing browser", taxonomy);
    expect(a).toEqual(b);
  });

  it("PROJECT-SPEC-DER-003: no intent → no suggestions", () => {
    expect(deriveCapabilities("", taxonomy)).toEqual([]);
  });
});

describe("toggleIn (PROJECT-SPEC-TOG)", () => {
  it("PROJECT-SPEC-TOG-001: adds and removes immutably", () => {
    const list = ["a"];
    const added = toggleIn(list, "b");
    const removed = toggleIn(added, "a");
    expect(added).toEqual(["a", "b"]);
    expect(removed).toEqual(["b"]);
    expect(list).toEqual(["a"]); // original untouched
  });
});
