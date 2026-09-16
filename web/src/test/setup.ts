import "@testing-library/jest-dom/vitest";

/**
 * Node ≥22 ships an experimental `localStorage` global that is inert without
 * `--localstorage-file`, and it shadows jsdom's storage on the test globals
 * (jsdom exposes storage on the Window prototype, which vitest does not copy
 * onto globalThis). Net effect: `localStorage` exists but is non-functional
 * while `sessionStorage` works. Install a deterministic in-memory Storage
 * whenever the real one is unusable — the app only needs get/set/remove/clear.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(String(k), String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
  } as Storage;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const current = (globalThis as Record<string, unknown>)[name];
  const broken = typeof current === "undefined" || typeof (current as Storage).getItem !== "function";
  if (broken) {
    Object.defineProperty(globalThis, name, {
      value: memoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}

/**
 * jsdom lacks URL.createObjectURL (used by both builders' downloads). Provide
 * a no-op so export flows can run under test; we assert on the JSON, not the
 * browser download mechanics.
 */
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}
