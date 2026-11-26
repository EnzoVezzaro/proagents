import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsolePage } from "./ConsolePage.js";
import type { AppCtx } from "../AppShell.js";

/**
 * CONSOLE (component) — interaction-level coverage for the read-only CLI
 * JSON viewer. Complements the pure normalization suite in console.test.ts.
 */

const ctx: AppCtx = {
  settings: { provider: { provider: "anthropic", model: "m", apiKey: "" }, githubToken: "", githubTokenExpiresAt: 0, githubRefreshToken: "", githubRefreshExpiresAt: 0 },
  navigate: () => {},
  user: null,
} as AppCtx;

const doctorJson = `{
  "status": "ok",
  "root": "/repo",
  "findings": [
    { "code": "DG002", "severity": "error", "file": ".agents/skills/senior-engineer/SKILL.md", "line": 1, "message": "SKILL.md missing", "suggestion": "proagent repair" },
    { "code": "DG005", "severity": "warning", "file": "AGENTS.md", "message": "stale block", "suggestion": "remove it" }
  ]
}`;

const auditJson = `{
  "status": "ok",
  "root": "/repo",
  "findings": [
    { "code": "AU001", "severity": "error", "file": "AGENTS.md", "line": 3, "message": "secret", "suggestion": "rotate" }
  ]
}`;

beforeEach(() => {
  cleanup();
});

describe("ConsolePage (CONSOLE-PAGE)", () => {
  it("CONSOLE-PAGE-001: renders tabs and the doctor command hint by default", () => {
    render(<ConsolePage ctx={ctx} />);
    expect(screen.getByRole("tab", { name: "doctor" })).toBeTruthy();
    expect(screen.getByText(/proagent doctor --json/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "list-installed" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "memory" })).toBeTruthy();
  });

  it("CONSOLE-PAGE-002: pasting doctor JSON renders findings with severity order", () => {
    render(<ConsolePage ctx={ctx} />);
    const ta = screen.getByPlaceholderText(/proagent doctor --json/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: doctorJson } });
    expect(document.body.textContent).toContain("DG002");
    expect(document.body.textContent).toContain("DG005");
    expect(document.body.textContent).toContain("2 finding(s)");
    expect(document.body.textContent).toContain("exit 2");
    // errors sort before warnings
    const text = document.body.textContent ?? "";
    expect(text.indexOf("DG002")).toBeLessThan(text.indexOf("DG005"));
  });

  it("CONSOLE-PAGE-003: audit tab parses AUJSON with its own hint", () => {
    render(<ConsolePage ctx={ctx} />);
    fireEvent.click(screen.getByRole("tab", { name: "audit" }));
    expect(screen.getByText(/proagent audit --json/)).toBeTruthy();
    const ta = screen.getByPlaceholderText(/proagent audit --json/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: auditJson } });
    expect(document.body.textContent).toContain("AU001");
    expect(document.body.textContent).toContain("1 finding(s)");
    expect(document.body.textContent).toContain("errors");
  });

  it("CONSOLE-PAGE-004: invalid JSON shows an error note", () => {
    render(<ConsolePage ctx={ctx} />);
    const ta = screen.getByPlaceholderText(/proagent doctor --json/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "{ nope" } });
    expect(document.body.textContent).toContain("Not valid JSON");
  });

  it("CONSOLE-PAGE-005: switching tabs clears the pasted report", () => {
    render(<ConsolePage ctx={ctx} />);
    const ta = screen.getByPlaceholderText(/proagent doctor --json/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: doctorJson } });
    expect(document.body.textContent).toContain("DG002");
    fireEvent.click(screen.getByRole("tab", { name: "memory" }));
    expect(document.body.textContent).not.toContain("DG002");
  });

  it("CONSOLE-PAGE-006: memory tab renders records sorted by key", () => {
    render(<ConsolePage ctx={ctx} />);
    fireEvent.click(screen.getByRole("tab", { name: "memory" }));
    const ta = screen.getByPlaceholderText(/proagent memory list/) as HTMLTextAreaElement;
    fireEvent.change(ta, {
      target: {
        value: `{ "command": "memory list", "records": [
          { "key": "zzz", "value": "last", "tags": [], "version": 1 },
          { "key": "aaa", "value": "first", "tags": ["ops"], "version": 2 }
        ] }`,
      },
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("aaa");
    expect(text).toContain("zzz");
    expect(text).toContain("2 record(s)");
    // rendered cards sort by key regardless of paste order (past JSON text
    // itself also lives in the body, so assert on the card list, not sep of
    // first occurrences)
    const keys = [...document.querySelectorAll("div strong")].map((n) => n.textContent).filter((t): t is string => t === "aaa" || t === "zzz");
    expect(keys).toEqual(["aaa", "zzz"]);
  });
});