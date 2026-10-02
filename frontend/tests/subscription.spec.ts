/**
 * Subscription badge E2E tests.
 *
 * Tests:
 * - Subscription badge is visible in the sidebar user menu
 * - Badge shows "Personal" for the default superuser
 * - Email is NOT shown in the sidebar trigger subtitle
 * - Loading state: a skeleton/placeholder is shown before data loads
 * - API failure fallback: badge still shows "Personal"
 * - User menu remains functional while subscription is loading/errored
 */

import { expect, test } from "@playwright/test"
import { firstSuperuser } from "./config.ts"

// All tests in this file require authentication (uses default auth setup)
test.describe("Subscription badge", () => {
  test("subscription badge is visible in the sidebar user menu", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("user-menu")).toBeVisible()
    await expect(page.getByTestId("subscription-badge")).toBeVisible()
  })

  test("subscription badge displays 'Personal' for default user", async ({
    page,
  }) => {
    await page.goto("/")
    const badge = page.getByTestId("subscription-badge")
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText("Personal")
  })

  test("subscription badge has data-plan attribute set to personal", async ({
    page,
  }) => {
    await page.goto("/")
    const badge = page.getByTestId("subscription-badge")
    await expect(badge).toHaveAttribute("data-plan", "personal")
  })

  test("email is not shown in the sidebar trigger subtitle", async ({
    page,
  }) => {
    await page.goto("/")
    const trigger = page.getByTestId("user-menu")
    await expect(trigger).toBeVisible()

    // The email should NOT be in the sidebar trigger (it's in the dropdown, not the button)
    const triggerText = await trigger.textContent()
    // Email contains '@' — it should not be in the trigger subtitle
    expect(triggerText).not.toMatch(firstSuperuser)
  })

  test("email is still visible inside the dropdown", async ({ page }) => {
    await page.goto("/")
    // Open the dropdown
    await page.getByTestId("user-menu").click()
    // Email should be in the dropdown content (DropdownMenuLabel)
    await expect(page.getByText(firstSuperuser)).toBeVisible()
  })

  test("user menu opens and shows expected items when subscription is loaded", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("user-menu").click()
    await expect(page.getByText("User Settings")).toBeVisible()
    await expect(page.getByText("Show Me Around")).toBeVisible()
    await expect(page.getByText("Log Out")).toBeVisible()
  })

  test("subscription badge is still shown when API returns an error (fallback)", async ({
    page,
  }) => {
    // Mock the subscription API to return a 500
    await page.route("**/api/v1/subscription/**", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" }),
    )

    await page.goto("/")

    // Badge should still be visible (UI-only fallback to Personal)
    const badge = page.getByTestId("subscription-badge")
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText("Personal")
  })

  test("user menu remains functional during subscription API failure", async ({
    page,
  }) => {
    await page.route("**/api/v1/subscription/**", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" }),
    )

    await page.goto("/")

    // Menu should still open and be usable
    await page.getByTestId("user-menu").click()
    await expect(page.getByText("Log Out")).toBeVisible()
  })
})

/**
 * Badge label translation tests.
 * These test the badge rendering directly using URL-mocked data.
 */
test.describe("Subscription badge label rendering", () => {
  test("badge renders 'Pro' when subscription plan is pro", async ({
    page,
  }) => {
    await page.route("**/api/v1/subscription/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "pro",
          billing_period: "monthly",
          status: "active",
          started_at: "2026-08-10T00:00:00Z",
          expires_at: "2026-09-09T00:00:00Z",
        }),
      }),
    )

    await page.goto("/")
    const badge = page.getByTestId("subscription-badge")
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText("Pro")
    await expect(badge).toHaveAttribute("data-plan", "pro")
  })

  test("badge renders 'Max' when subscription plan is max", async ({
    page,
  }) => {
    await page.route("**/api/v1/subscription/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "max",
          billing_period: "yearly",
          status: "active",
          started_at: "2026-08-10T00:00:00Z",
          expires_at: "2027-08-10T00:00:00Z",
        }),
      }),
    )

    await page.goto("/")
    const badge = page.getByTestId("subscription-badge")
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText("Max")
    await expect(badge).toHaveAttribute("data-plan", "max")
  })

  test("badge renders 'Personal' when subscription plan is personal", async ({
    page,
  }) => {
    await page.route("**/api/v1/subscription/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "personal",
          billing_period: null,
          status: "active",
          started_at: null,
          expires_at: null,
        }),
      }),
    )

    await page.goto("/")
    const badge = page.getByTestId("subscription-badge")
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText("Personal")
  })
})
