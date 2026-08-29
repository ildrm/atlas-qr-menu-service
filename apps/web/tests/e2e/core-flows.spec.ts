import { expect, test } from "@playwright/test";

const apiOrigin = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1",
).origin;

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("mina@atlasqr.local");
  await page.getByLabel("Password").fill("AtlasDemo!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard\?business=/);
}

async function openWorkspaceView(
  page: import("@playwright/test").Page,
  name: string,
) {
  if ((page.viewportSize()?.width ?? 1440) < 760)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name })
    .click();
}

test("owner signs in and sees persisted dashboard metrics", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Good morning, Mina" }),
  ).toBeVisible();
  await expect(page.getByText("All day menu").first()).toBeVisible();
  await expect(page.getByText("QR scans").first()).toBeVisible();
});

test("owner reads tenant team and persists an accessible theme", async ({
  page,
}) => {
  await signIn(page);
  await openWorkspaceView(page, "Appearance");
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(page.getByRole("status")).toContainText("Saved theme version");
  await openWorkspaceView(page, "Team");
  await expect(page.getByText("Mina Rahimi")).toBeVisible();
  await expect(page.getByText("mina@atlasqr.local")).toBeVisible();
});

test("dynamic QR preserves branch, locale, and table context", async ({
  page,
}) => {
  await page.goto(`${apiOrigin}/q/BrewBloomQR2026DemoToken`);
  await expect(page).toHaveURL(
    /\/b\/brew-bloom\/all-day-menu\?.*branch=downtown.*locale=en.*table=12/,
  );
  await expect(page.getByText("Table 12")).toBeVisible();
});

test("public catalog supports search, categories, favorite, and item details", async ({
  page,
}) => {
  await page.goto("/b/brew-bloom/all-day-menu?branch=downtown");
  await expect(
    page.getByRole("heading", { name: "Brew & Bloom" }),
  ).toBeVisible();
  await page.getByPlaceholder("Search the menu").fill("Citrus");
  await expect(
    page.getByRole("heading", { name: "Citrus tonic" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Espresso" })).toBeHidden();
  await page.getByPlaceholder("Search the menu").fill("");
  await page.getByRole("tab", { name: "Coffee" }).click();
  await expect(page.getByRole("heading", { name: "Espresso" })).toBeVisible();
  await page.getByRole("button", { name: "Add Espresso to favorites" }).click();
  await expect(
    page.getByRole("button", { name: "Remove Espresso from favorites" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show favorites" }).click();
  await expect(page.getByRole("heading", { name: "Espresso" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pistachio latte" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Open details for Espresso" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Espresso" }),
  ).toBeVisible();
  await expect(page.getByText("Small")).toBeVisible();

  await page.goto("/b/brew-bloom/all-day-menu#espresso");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Espresso" }),
  ).toBeVisible();
});

test("Persian public catalog switches to RTL", async ({ page }) => {
  await page.goto("/b/brew-bloom/all-day-menu?locale=fa");
  await expect(page.locator("main.public-catalog")).toHaveAttribute(
    "dir",
    "rtl",
  );
  await expect(page.getByRole("heading", { name: "اسپرسو" })).toBeVisible();
});
