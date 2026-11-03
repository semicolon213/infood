import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 단위·통합 테스트 (docs/10_TEST_PLAN.md 2장). E2E는 Playwright(tests/e2e).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: { AI_MOCK: "1" },
  },
});
