import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const operatorStorageState = process.env.E2E_OPERATOR_STORAGE_STATE;
const runId = randomUUID();
const testEmail = `browser-e2e-${runId}@example.invalid`;
const testName = `Browser E2E ${runId.slice(0, 8)}`;
const operatorNote = `Browser handoff verification ${runId}`;

let createdRequestId;

test.describe("client request handoff", () => {
  test.describe.configure({ mode: "serial" });

  test("submits a public request, displays its server reference, and rejects invalid submissions", async ({
    page,
  }) => {
    await page.goto("/client-services/");

    await page.getByTestId("button-service-estate").click();
    await page
      .getByTestId("input-job-location")
      .fill("Houston, Harris County, Texas");
    await page
      .getByTestId("input-description")
      .fill("Please assess an estate cleanout and pickup for this test.");
    await page.getByTestId("input-full-name").fill(testName);
    await page.getByTestId("input-email").fill(testEmail);

    let consentlessUiPosts = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/client/requests"
      ) {
        consentlessUiPosts += 1;
      }
    });

    await page.getByTestId("button-submit-request").click();
    await expect(page.getByTestId("input-consent")).not.toBeChecked();
    expect(consentlessUiPosts).toBe(0);

    const invalidResults = await page.evaluate(async (email) => {
      const base = {
        serviceClass: "estate",
        fullName: "Browser E2E Validation",
        email,
        phone: null,
        jobLocation: "Houston, Harris County, Texas",
        description: "A validation-only request that must not be stored.",
        preferredDate: null,
      };

      const missingConsent = await fetch("/api/client/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(base),
      });
      const invalidEmail = await fetch("/api/client/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...base,
          email: "not-an-email",
          consentToContact: true,
        }),
      });

      return {
        missingConsentStatus: missingConsent.status,
        invalidEmailStatus: invalidEmail.status,
      };
    }, testEmail);

    expect(invalidResults.missingConsentStatus).toBe(400);
    expect(invalidResults.invalidEmailStatus).toBe(400);

    await page.getByTestId("input-consent").check();
    const responsePromise = page.waitForResponse((response) => {
      return (
        new URL(response.url()).pathname === "/api/client/requests" &&
        response.request().method() === "POST"
      );
    });
    await page.getByTestId("button-submit-request").click();

    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    createdRequestId = result.requestId;

    await expect(page.getByTestId("status-request-accepted")).toBeVisible();
    await expect(page.getByTestId("text-request-reference")).toHaveText(
      createdRequestId,
    );
  });

  test("shows the request in the authenticated operator inbox and persists its status", async ({
    page,
  }) => {
    test.skip(
      !operatorStorageState,
      "Configure development Clerk and provide E2E_OPERATOR_STORAGE_STATE from a real signed-in operator session to run the authenticated inbox check.",
    );

    expect(createdRequestId).toBeTruthy();
    await page.goto("/client-requests");

    await expect(
      page.getByRole("heading", { name: "Client requests" }),
    ).toBeVisible();
    const requestCard = page.getByTestId(
      `card-client-request-${createdRequestId}`,
    );
    await expect(requestCard).toBeVisible();
    await expect(requestCard).toContainText(testEmail);

    const statusSelect = requestCard.getByTestId(
      `select-request-status-${createdRequestId}`,
    );
    await statusSelect.selectOption("reviewing");
    await requestCard
      .getByTestId(`input-request-note-${createdRequestId}`)
      .fill(operatorNote);
    await requestCard
      .getByTestId(`button-save-request-${createdRequestId}`)
      .click();

    await expect(page.getByText("Request updates saved.")).toBeVisible();
    await page.reload();

    const reloadedCard = page.getByTestId(
      `card-client-request-${createdRequestId}`,
    );
    await expect(
      reloadedCard.getByTestId(
        `select-request-status-${createdRequestId}`,
      ),
    ).toHaveValue("reviewing");
    await expect(
      reloadedCard.getByTestId(`input-request-note-${createdRequestId}`),
    ).toHaveValue(operatorNote);
  });

  test("keeps the operator request endpoint inaccessible without a signed-in session", async ({
    browser,
    baseURL,
  }) => {
    const anonymousContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });

    try {
      const page = await anonymousContext.newPage();
      await page.goto("/client-services/");
      const result = await page.evaluate(async () => {
        const response = await fetch("/api/client/requests");
        return {
          status: response.status,
          body: await response.json(),
        };
      });

      expect([401, 503]).toContain(result.status);
      expect(Array.isArray(result.body)).toBe(false);
    } finally {
      await anonymousContext.close();
    }
  });

  test.afterAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is required so browser-test records can be cleaned up.",
      );
    }

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    await client.connect();
    try {
      await client.query(
        "DELETE FROM client_service_requests WHERE email = $1",
        [testEmail],
      );
    } finally {
      await client.end();
    }
  });
});
