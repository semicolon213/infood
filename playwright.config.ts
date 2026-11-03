import { defineConfig, devices } from "@playwright/test";

// E2E: 모바일 뷰포트 375×812 (docs/10_TEST_PLAN.md 2장)
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    ...devices["iPhone 13"],
    viewport: { width: 375, height: 812 },
    browserName: "chromium",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
