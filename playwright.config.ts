import { defineConfig, devices } from "@playwright/test";

// Test the app the way GitHub Pages serves it: under a sub-path. Override with BASE_PATH=/ to test at the root.
process.env.BASE_PATH ??= "/railtally/";
const base = process.env.BASE_PATH.replace(/\/?$/, "/");

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: `http://localhost:4173${base}`, ...devices["Pixel 7"] },
  webServer: { command: "VITE_SYNC_URL= npm run build && npm run preview", url: `http://localhost:4173${base}`, reuseExistingServer: true },
});
