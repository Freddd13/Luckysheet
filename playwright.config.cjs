const path = require("path");
if (require("fs").existsSync("tmp/playwright-browsers"))
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(
    "tmp/playwright-browsers"
  );
module.exports = {
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 1,
  outputDir: "./tmp/test-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1366, height: 900 },
    headless: true,
    channel: process.env.LUCKYSHEET_BROWSER_CHANNEL,
    launchOptions: { args: ["--enable-precise-memory-info"] },
    trace: "retain-on-failure",
  },
};
