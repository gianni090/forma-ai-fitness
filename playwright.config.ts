import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "**/*.ui.ts", fullyParallel: true, retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]], use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" } }],
  webServer: { command: "npm start -- -H 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
