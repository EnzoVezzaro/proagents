import { defineConfig } from "vitest/config";

// One test runner for the merged project (vitest 3 `test.projects`):
//  - root project: the deterministic core/CLI suite (node environment)
//  - web project:  the marketplace SPA component suite (jsdom)
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          include: ["tests/**/*.test.ts"],
          environment: "node",
          testTimeout: 15000,
        },
      },
      {
        root: "web",
        test: {
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          globals: false,
        },
        esbuild: { target: "es2022" },
      },
    ],
  },
});
