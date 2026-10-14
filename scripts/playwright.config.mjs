import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:80";
const hostname = new URL(baseURL).hostname.toLowerCase();
const isLocalOrDevelopment =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1" ||
  hostname.endsWith(".replit.dev");

if (process.env.NODE_ENV === "production" || !isLocalOrDevelopment) {
  throw new Error(
    "Browser checks are restricted to local or Replit development URLs; production URLs are not allowed.",
  );
}

const operatorStorageState = process.env.E2E_OPERATOR_STORAGE_STATE
  ? resolve(process.env.E2E_OPERATOR_STORAGE_STATE)
  : undefined;

if (operatorStorageState && !existsSync(operatorStorageState)) {
  throw new Error(
    "E2E_OPERATOR_STORAGE_STATE points to a file that does not exist.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  outputDir: "./test-results",
  use: {
    baseURL,
    ...(operatorStorageState ? { storageState: operatorStorageState } : {}),
    trace: "retain-on-failure",
  },
});
