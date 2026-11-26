import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { PlanViewPage, SPEC_DRAFT_KEY, loadSpecDraft } from "./PlanViewPage.js";
import type { AppCtx } from "../AppShell.js";
import type { SpecDocument } from "../../types.js";

/**
 * PLAN-VIEW (component) — render contract for the read-only plan surface.
 * The draft travels over sessionStorage (written by ProjectBuilderPage's
 * export step), so hydration + empty-state are part of the surface.
 */

const ctx: AppCtx = {
  settings: { provider: { provider: "anthropic", model: "m", apiKey: "" }, githubToken: "", githubTokenExpiresAt: 0, githubRefreshToken: "", githubRefreshExpiresAt: 0 },
  navigate: () => {},
  user: null,
} as AppCtx;

const spec: SpecDocument = {
  schema: "proagents/v1",
  project: { name: "demo-project" },
  environment: {
    profiles: ["alpha", "beta"],
    crews: ["guard"],
    capabilities: ["ci"],
  },
  harness: { mode: "compatible", compatibility: ["codex"] },
};

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("PlanViewPage (PLAN-PAGE)", () => {
  it("PLAN-PAGE-001: empty state when no draft is present", () => {
    render(<PlanViewPage ctx={ctx} navigate={() => {}} />);
    expect(screen.getByText(/No plan draft yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open the Build flow/ })).toBeTruthy();
  });

  it("PLAN-PAGE-002: reads a draft from sessionStorage and renders sections", () => {
    sessionStorage.setItem(SPEC_DRAFT_KEY, JSON.stringify(spec));
    render(<PlanViewPage ctx={ctx} navigate={() => {}} />);
    expect(document.body.textContent).toContain("demo-project — plan");
    expect(document.body.textContent).toContain("Profiles");
    expect(document.body.textContent).toContain("alpha");
    expect(document.body.textContent).toContain("Crews");
    expect(document.body.textContent).toContain("guard");
    expect(document.body.textContent).toContain("proagent setup --harness codex");
    expect(document.body.textContent).toContain("proagent validate --spec proagents.yaml");
    expect(document.body.textContent).toContain("schema: proagents/v1");
    expect(document.body.textContent).toContain("name: demo-project");
  });

  it("PLAN-PAGE-003: 'Build flow' button navigates back", () => {
    sessionStorage.setItem(SPEC_DRAFT_KEY, JSON.stringify(spec));
    const spy = { last: "" };
    render(<PlanViewPage ctx={ctx} navigate={(to) => { spy.last = to; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit in Build/ }));
    expect(spy.last).toBe("build-environment");
  });

  it("PLAN-PAGE-004: loadSpecDraft rejects garbage", () => {
    sessionStorage.setItem(SPEC_DRAFT_KEY, "not json");
    expect(loadSpecDraft()).toBeNull();
    sessionStorage.setItem(SPEC_DRAFT_KEY, JSON.stringify({ project: 7 }));
    expect(loadSpecDraft()).toBeNull();
  });
});