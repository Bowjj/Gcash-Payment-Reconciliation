import { defineConfig } from "@playwright/test";

const configuredBaseURL = process.env["PLAYWRIGHT_BASE_URL"];
const baseURL = configuredBaseURL ?? "http://127.0.0.1:3100";
const isCI = process.env["CI"] !== undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  failOnFlakyTests: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  ...(configuredBaseURL === undefined
    ? {
        webServer: {
          command: "corepack pnpm start --hostname 127.0.0.1 --port 3100",
          reuseExistingServer: false,
          stderr: "pipe",
          stdout: "pipe",
          timeout: 120_000,
          url: baseURL,
        },
      }
    : {}),
});
