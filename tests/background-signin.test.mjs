import test from "node:test";
import assert from "node:assert/strict";
import { backgroundSignIn } from "../src/backgroundSignIn.mjs";

test("shared sign-in follows redirects in a credentialed request", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    requests.push({ path, options });
    return path === "/api/sso/status"
      ? Response.json({ configured: true, action: "resume" })
      : new Response(null, { status: 204 });
  });
  assert.equal(await backgroundSignIn("resume"), true);
  assert.equal(requests.length, 2);
  assert.deepEqual(
    Object.fromEntries(new URL(requests[1].path, "https://mercado.bittrees.org").searchParams),
    { mode: "resume", return_to: "/auth/session-complete" },
  );
  assert.equal(requests[1].options.mode, "no-cors");
  assert.equal(requests[1].options.credentials, "include");
});

test("shared sign-in respects a suppressed session and cancellation", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ configured: true, action: null }),
  );
  assert.equal(await backgroundSignIn("resume"), false);
  assert.equal(await backgroundSignIn("publish", AbortSignal.abort()), false);
  assert.equal(fetch.mock.callCount(), 1);
});
