// Run against npm run dev -- --port 4173. All APIs and wallets are test doubles; no real messages or signatures.
import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium, firefox, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = "http://127.0.0.1:4173";
const items = JSON.parse(fs.readFileSync("data/sourcing-round2.json")).slice(
  0,
  35,
);
const products = [...new Set(items.map((p) => p.product_id))].map((id) => ({
  id,
  name: id,
  active: true,
}));
const owner = {
  identity: "0x" + "1".repeat(40),
  role: "owner",
  owner: true,
  staff: true,
  canProducts: true,
  canDeals: true,
  canQuotes: true,
  canVendors: true,
  referral: "1234567890abcdef",
};
const quotes = Array.from({ length: 45 }, (_, i) => ({
  id: "quote-" + i,
  identity: `buyer${i}@example.com`,
  name: "Bitaxe",
  quantity: i + 1,
  details: "Delivery to Portugal. Please confirm availability.",
  status: i % 2 ? "reviewing" : "new",
  created_at: new Date().toISOString(),
}));
const admin = { items, quotes, offers: [], roles: [], vendors: [] };
let checked = 0;
for (const [engine, name] of [
  [chromium, "chromium"],
  [firefox, "firefox"],
  [webkit, "webkit"],
]) {
  const browser = await engine.launch();
  try {
    for (const width of [320, 375, 812, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.fulfill({ status: 204 });
        if (url.pathname.startsWith("/api/"))
          return route.fulfill({
            json:
              url.pathname === "/api/catalog"
                ? { products, items, offers: [] }
                : url.pathname === "/api/me"
                  ? { user: owner, quotes: [] }
                  : url.pathname === "/api/admin"
                    ? admin
                    : { ok: true },
          });
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const section of [
        "overview",
        "products",
        "offers",
        "quotes",
        "vendors",
        "team",
        "notifications",
      ]) {
        await page.goto(base + "/admin/" + section);
        await page.locator(".admin-heading").waitFor();
        await page.waitForFunction(
          () =>
            !document.querySelector(".admin-page")?.getAttribute("aria-busy") ||
            document.querySelector(".admin-page").getAttribute("aria-busy") ===
              "false",
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${name} ${width} ${section} overflow`,
        );
        if (section === "quotes") {
          assert.equal(await page.locator(".admin-page .record").count(), 20);
          await page.getByRole("searchbox").fill("buyer44");
          assert.equal(await page.locator(".admin-page .record").count(), 1);
          await page.getByRole("searchbox").fill("no-match");
          assert.equal(await page.locator(".admin-page .record").count(), 0);
          await page.getByRole("searchbox").fill("");
          if (width === 375 && name === "webkit")
            await page.screenshot({
              path: "/tmp/mercado-qa/admin-mobile.png",
              fullPage: false,
            });
        }
        if (section === "products") {
          await page
            .getByRole("searchbox", { name: "Search products" })
            .fill(items[0].id);
          await page
            .getByLabel("Find an existing product")
            .selectOption(items[0].id);
          await page
            .getByLabel("Product name", { exact: true })
            .waitFor({ state: "visible" });
          if (width === 1440 && name === "chromium")
            await page.screenshot({
              path: "/tmp/mercado-qa/admin-desktop.png",
              fullPage: false,
            });
        }
        checked++;
      }
      assert.deepEqual(errors, [], `${name} page errors`);
      await context.close();
    }
    // Multiple provider discovery and cancellation: proves the chosen provider receives requests.
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await ctx.addInitScript(() => {
      window.walletCalls = [];
      window.walletEvents = {};
      for (const [uuid, name] of [
        ["first", "Wallet Alpha"],
        ["second", "Wallet Beta"],
      ]) {
        const provider = {
          on(event, cb) {
            window.walletEvents[event] = cb;
          },
          removeListener(event) {
            delete window.walletEvents[event];
          },
          async request(r) {
            window.walletCalls.push([uuid, r.method]);
            if (r.method === "eth_requestAccounts" && uuid === "second")
              throw Object.assign(new Error("Declined"), { code: 4001 });
            if (["eth_requestAccounts", "eth_accounts"].includes(r.method))
              return ["0x" + "1".repeat(40)];
            if (r.method === "personal_sign") return "0xfakesignature";
          },
        };
        window.addEventListener("eip6963:requestProvider", () =>
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: { info: { uuid, name }, provider },
            }),
          ),
        );
      }
    });
    let signedIn = false;
    await ctx.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.fulfill({ status: 204 });
      if (url.pathname === "/api/catalog")
        return route.fulfill({ json: { products, items, offers: [] } });
      if (["/api/me", "/api/session"].includes(url.pathname))
        return route.fulfill(
          signedIn
            ? { json: { user: owner, quotes: [] } }
            : { status: 401, json: { error: "Sign in" } },
        );
      if (url.pathname === "/api/auth/nonce")
        return route.fulfill({
          json: { nonce: "testnonce123", domain: "127.0.0.1:4173", uri: base },
        });
      if (url.pathname === "/api/auth/wallet") {
        signedIn = true;
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === "/api/auth/logout") {
        signedIn = false;
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === "/api/admin") return route.fulfill({ json: admin });
      return route.continue();
    });
    const page = await ctx.newPage();
    await page.goto(base + "/admin");
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Continue with Wallet Beta" })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Request declined" })
      .waitFor();
    assert.deepEqual(await page.evaluate(() => window.walletCalls), [
      ["second", "eth_requestAccounts"],
    ]);
    await page
      .getByRole("button", { name: "Continue with Wallet Alpha" })
      .click();
    await page.locator(".admin-heading").waitFor();
    await page.waitForFunction(
      () => typeof window.walletEvents.accountsChanged === "function",
    );
    await page.evaluate(() =>
      window.walletEvents.accountsChanged(["0x" + "2".repeat(40)]),
    );
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .waitFor();
    await ctx.close();
    console.log(
      "PASS",
      name,
      "desktop/mobile admin pages, selected-wallet cancellation, sign-in and account-change sign-out",
    );
  } finally {
    await browser.close();
  }
}
console.log(
  "PASS:",
  checked,
  "admin page/viewport combinations across three engines.",
);
