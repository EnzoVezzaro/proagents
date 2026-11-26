import { describe, expect, it, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectBuilderPage } from "./ProjectBuilderPage.js";
import type { AppCtx } from "../AppShell.js";
import type { MarketplaceCatalog } from "../../types.js";

/**
 * PROJECT-BUILDER (component) — interaction tests for the Studio Build mode:
 * step rail navigation, capability chips, artifact selection, export
 * (download + yaml preview + validation findings).
 */

const ctx: AppCtx = {
  settings: { provider: { provider: "anthropic", model: "m", apiKey: "" }, githubToken: "", githubTokenExpiresAt: 0, githubRefreshToken: "", githubRefreshExpiresAt: 0 },
  navigate: () => {},
  user: null,
} as AppCtx;

const catalog: MarketplaceCatalog = {
  schemaVersion: 1,
  updatedAt: "1970-01-01T00:00:00.000Z",
  items: [
    {
      id: "accessibility-engineer",
      name: "Accessibility Engineer",
      version: "1.1.0",
      description: "Inclusive interfaces.",
      author: "proagents",
      tags: ["a11y"],
      kind: "profile",
      downloads: 0,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
      provides: ["accessibility", "browser-automation"],
    },
    {
      id: "data-platform-crew",
      name: "Data Platform Crew",
      version: "1.0.0",
      description: "Data pipelines crew.",
      author: "proagents",
      tags: ["data"],
      kind: "crew",
      downloads: 0,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
      provides: ["database-access"],
    },
  ],
};

const taxonomy = [
  { id: "accessibility", title: "Accessibility", description: "a11y" },
  { id: "database-access", title: "Database Access", description: "db" },
];

function mockFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url);
      if (u.includes("capabilities/index.json")) {
        return Promise.resolve(new Response(JSON.stringify(taxonomy), { status: 200 }));
      }
      if (u.includes("catalog.json")) {
        return Promise.resolve(new Response(JSON.stringify(catalog), { status: 200 }));
      }
      // The AI Magic call goes through callModel → OpenAI-compatible
      // chat/completions. Reply with the strict-JSON contract.
      if (u.includes("/chat/completions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content:
                      '{"name":"Sargassum Alarm","intent":"Realtime sargassum beach monitoring with a React dashboard, Node ingestion API and PostgreSQL, needing DevOps and data-pipeline expertise.","notes":["Sharpened the intent with concrete stack."]}',
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    }),
  );
}

beforeEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("ProjectBuilderPage (PROJECT-BUILDER)", () => {
  it("PROJECT-BUILDER-001: renders the 5-step rail and the intent form", async () => {
    mockFetch();
    render(<ProjectBuilderPage ctx={ctx} />);
    const rail = document.body.textContent ?? "";
    for (const title of ["Intent", "Capabilities", "Artifacts", "Policies", "Instructions"]) {
      expect(rail).toContain(title);
    }
    expect(screen.getByLabelText(/Project name/i)).toBeTruthy();
    expect(screen.getByLabelText(/Intent/i)).toBeTruthy();
    // Catalog loads without an error note.
    await waitFor(() => expect(screen.queryByText(/Could not load the registry catalog/)).toBeNull());
  });

  it("PROJECT-BUILDER-002: Next stays disabled until name and intent are filled", async () => {
    mockFetch();
    render(<ProjectBuilderPage ctx={ctx} />);
    const next = screen.getByRole("button", { name: /Next: Capabilities/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: "my-saas" } });
    fireEvent.change(screen.getByLabelText(/Intent/i), { target: { value: "Build a SaaS app" } });
    expect(next.disabled).toBe(false);
  });

  it("PROJECT-BUILDER-003: suggested capabilities from the intent light the chips", async () => {
    mockFetch();
    render(<ProjectBuilderPage ctx={ctx} />);
    fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: "my-saas" } });
    fireEvent.change(screen.getByLabelText(/Intent/i), { target: { value: "Accessibility reviews with database access" } });
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Accessibility/ }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Accessibility/ })[0]!);
    expect(screen.getAllByRole("button", { name: /✓ Accessibility/ }).length).toBeGreaterThan(0);
  });

  it("PROJECT-BUILDER-004: artifacts step lists catalog providers and adds them", async () => {
    mockFetch();
    render(<ProjectBuilderPage ctx={ctx} />);
    // Jump straight to artifacts via the rail.
    fireEvent.click(screen.getByRole("tab", { name: /Artifacts/ }));
    // No capabilities selected → the empty hint shows.
    expect(document.body.textContent).toContain("No native items provide the selected capabilities");
    // Pick a capability on the capabilities step, then return.
    fireEvent.click(screen.getByRole("tab", { name: /Capabilities/ }));
    await waitFor(() => screen.getByRole("button", { name: /Database Access/ }));
    fireEvent.click(screen.getByRole("button", { name: /Database Access/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Artifacts/ }));
    const addBtn = screen.getByRole("button", { name: /Add to environment/ });
    fireEvent.click(addBtn);
    expect(screen.getByRole("button", { name: /✓ In environment/ })).toBeTruthy();
  });

  it("PROJECT-BUILDER-005: export previews the yaml and copies it to the clipboard", async () => {
    mockFetch();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, "clipboard");
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const anchorSpy = vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "a") {
        const a = originalCreateElement("a");
        Object.defineProperty(a, "click", { value: clickSpy });
        return a;
      }
      return originalCreateElement(tag);
    }) as never);
    try {
      render(<ProjectBuilderPage ctx={ctx} />);
      fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: "my-saas" } });
      fireEvent.click(screen.getByRole("tab", { name: /Instructions/ }));
      await waitFor(() => {
        expect(screen.getByLabelText(/proagents.yaml preview/)).toBeTruthy();
      });
      const preview = screen.getByLabelText(/proagents.yaml preview/).textContent ?? "";
      expect(preview).toContain("schema: proagents/v1");
      expect(preview).toContain("name: my-saas");
      // Primary action: copy the FULL agent handoff brief (context + yaml +
      // commands), not just the bare spec.
      fireEvent.click(screen.getByRole("button", { name: /Copy full instructions/ }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      const brief = writeText.mock.calls[0]?.[0] as string;
      expect(brief).toContain("Instructions to build proagent my-saas");
      expect(brief).toContain("```yaml");
      expect(brief).toContain("schema: proagents/v1");
      expect(brief).toContain("name: my-saas");
      expect(brief).toContain("proagent resolve");
      expect(brief).toContain("proagent setup");
      expect(brief).toContain("PA502");
      // The embedded yaml block matches the visible preview byte-for-byte.
      const yamlPreview = screen.getByLabelText(/proagents.yaml preview/).textContent ?? "";
      expect(brief).toContain(yamlPreview.replace(/\n$/, ""));
      expect(await screen.findByText(/✓ Copied/)).toBeTruthy();
      // Secondary action: the file download still works.
      fireEvent.click(screen.getByRole("button", { name: /Download proagents.yaml/ }));
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      anchorSpy.mockRestore();
      if (desc) Object.defineProperty(Navigator.prototype, "clipboard", desc);
      else delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
  });

  it("PROJECT-BUILDER-005b: copy failure falls back to the download hint", async () => {
    mockFetch();
    const reject = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText: reject }, configurable: true });
    const exec = document.execCommand;
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => {
      throw new Error("unsupported");
    });
    try {
      render(<ProjectBuilderPage ctx={ctx} />);
      fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: "my-saas" } });
      fireEvent.click(screen.getByRole("tab", { name: /Instructions/ }));
      await waitFor(() => screen.getByLabelText(/proagents.yaml preview/));
      fireEvent.click(screen.getByRole("button", { name: /Copy full instructions/ }));
      expect(await screen.findByText(/Copy failed/)).toBeTruthy();
    } finally {
      document.execCommand = exec;
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
  });

  it("PROJECT-BUILDER-006: policies step toggles workspace-only and harness targets into the spec", async () => {
    mockFetch();
    render(<ProjectBuilderPage ctx={ctx} />);
    fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: "my-saas" } });
    fireEvent.click(screen.getByRole("tab", { name: /Policies/ }));
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true); // default workspace-only
    fireEvent.click(screen.getByRole("button", { name: /codex/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Instructions/ }));
    await waitFor(() => {
      const preview = screen.getByLabelText(/proagents.yaml preview/).textContent ?? "";
      expect(preview).toContain("workspace-only: true");
      expect(preview).toContain("- codex");
    });
  });

  it("PROJECT-BUILDER-AIMAGIC-001: the AI Magic button is disabled without a provider key", async () => {
    mockFetch();
    render(<ProjectBuilderPage ctx={ctx} />);
    const magic = screen.getByRole("button", { name: /AI Magic/i }) as HTMLButtonElement;
    expect(magic.disabled).toBe(true);
    expect(screen.getByText(/add a provider API key in Settings/i)).toBeTruthy();
  });

  it("PROJECT-BUILDER-AIMAGIC-002: with a key, it reviews and improves name + intent from strict JSON", async () => {
    mockFetch();
    const configured: AppCtx = {
      ...ctx,
      settings: { ...ctx.settings, provider: { provider: "openai", model: "gpt-test", apiKey: "sk-test" } },
    };
    render(<ProjectBuilderPage ctx={configured} />);
    fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: "sargassum" } });
    fireEvent.change(screen.getByLabelText(/Intent/i), { target: { value: "Beach monitoring app" } });
    fireEvent.click(screen.getByRole("button", { name: /AI Magic/i }));
    expect(await screen.findByText(/What the model improved/i)).toBeTruthy();
    expect((screen.getByLabelText(/Project name/i) as HTMLInputElement).value).toBe("Sargassum Alarm");
    expect((screen.getByLabelText(/Intent/i) as HTMLTextAreaElement).value).toContain("PostgreSQL");
  });

  it("PROJECT-BUILDER-006b: policies step offers all known harnesses, select all/clear, and warns on bad allowlist entries", async () => {
    mockFetch();
    render(<ProjectBuilderPage ctx={ctx} />);
    fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: "my-saas" } });
    fireEvent.click(screen.getByRole("tab", { name: /Policies/ }));
    // All nine known harnesses are offered (mirror of src/registry/spec.ts).
    for (const h of ["claude-code", "codex", "opencode", "cursor", "gemini-cli", "copilot", "openclaude", "freebuff", "generic-cli"]) {
      expect(screen.getByRole("button", { name: new RegExp(h) })).toBeTruthy();
    }
    // Select all / clear work.
    fireEvent.click(screen.getByRole("button", { name: /Select all/ }));
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(screen.getByText(/spec stays harness-agnostic/)).toBeTruthy();
    // PA506: wildcard and malformed entries warn inline, before export.
    const network = screen.getByLabelText(/Network allowlist/i);
    fireEvent.change(network, { target: { value: "api.example.com*" } });
    expect(await screen.findByText(/trailing wildcard/)).toBeTruthy();
    fireEvent.change(network, { target: { value: "*.example.com" } });
    expect(await screen.findByText(/does not look like a hostname/)).toBeTruthy();
    fireEvent.change(network, { target: { value: "github.com, api.example.com" } });
    await waitFor(() => expect(screen.queryByText(/trailing wildcard/)).toBeNull());
  });
});
