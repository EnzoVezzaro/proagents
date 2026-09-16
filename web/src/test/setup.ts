import "@testing-library/jest-dom/vitest";

/**
 * jsdom lacks URL.createObjectURL (used by both builders' downloads). Provide
 * a no-op so export flows can run under test; we assert on the JSON, not the
 * browser download mechanics.
 */
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}
