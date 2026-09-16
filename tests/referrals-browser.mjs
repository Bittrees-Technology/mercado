// Local UI checks with mocked APIs; no real accounts or referral codes are changed.
import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = "http://127.0.0.1:4173";
const items = JSON.parse(fs.readFileSync("data/home-mining-gadgets.json"));
const products = [...new Set(items.map((p) => p.product_id))].map((id) => ({
  id,
  name: id,
  category: "Mining",
  description: "Mining hardware",
  active: true,
}));
const browser = await chromium.launch();
try {
  for (const width of [375, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    await context.addInitScript(() => {
      window.copied = "";
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (value) => {
            window.copied = value;
          },
        },
      });
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.fulfill({ status: 204 });
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({
          json:
            url.pathname === "/api/catalog"
              ? { items, products, offers: [] }
              : url.pathname === "/api/me"
                ? {
                    user: {
                      identity: "member@example.com",
                      referral: "1234567890abcdef",
                    },
                    quotes: [],
                  }
                : url.pathname === "/api/referrals/new"
                  ? { referral: "abcdef1234567890" }
                  : { ok: true },
        });
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(base);
    await page.getByRole("button", { name: "Referrals", exact: true }).click();
    await page.getByText("Choose a custom code", { exact: true }).click();
    await page
      .getByRole("button", { name: "Generate a code instead", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Your member referral code"]')
          ?.value === "abcdef1234567890",
    );
    assert.equal(
      await page
        .getByLabel("Your member referral code", { exact: true })
        .inputValue(),
      "abcdef1234567890",
    );
    await page
      .getByRole("button", { name: "Copy store link", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => window.copied),
      "https://mercado.bittrees.org/?ref=abcdef1234567890",
    );
    await page.getByText("Link to a product or collection", { exact: true }).click();
    await page.getByLabel("Search products", { exact: true }).fill("coffee");
    await page
      .getByRole("combobox", { name: /Individual product/ })
      .selectOption("magicminer-wm02");
    await page
      .getByRole("button", { name: "Copy product link", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => window.copied),
      "https://mercado.bittrees.org/equipment/asic/magicminer-wm02?ref=abcdef1234567890",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await context.close();
  }
  console.log(
    "PASS: mobile and desktop referral renewal, catalog search and copied links.",
  );
} finally {
  await browser.close();
}
