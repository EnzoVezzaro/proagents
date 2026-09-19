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
    for (const title of ["Intent", "Capabilities", "Artifacts", "Policies", "Export"]) {
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

  it("PROJECT-BUILDER-005: export previews the yaml and fires the download", async () => {
    mockFetch();
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
      fireEvent.click(screen.getByRole("tab", { name: /Export/ }));
      await waitFor(() => {
        expect(screen.getByLabelText(/proagents.yaml preview/)).toBeTruthy();
      });
      const preview = screen.getByLabelText(/proagents.yaml preview/).textContent ?? "";
      expect(preview).toContain("schema: proagents/v1");
      expect(preview).toContain("name: my-saas");
      fireEvent.click(screen.getByRole("button", { name: /Download proagents.yaml/ }));
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      anchorSpy.mockRestore();
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
    fireEvent.click(screen.getByRole("tab", { name: /Export/ }));
    await waitFor(() => {
      const preview = screen.getByLabelText(/proagents.yaml preview/).textContent ?? "";
      expect(preview).toContain("workspace-only: true");
      expect(preview).toContain("- codex");
    });
  });
});
