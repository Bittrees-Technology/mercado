export async function backgroundSignIn(mode, signal) {
  if (signal?.aborted) return false;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 15000);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const status = await fetch("/api/sso/status", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!status.ok) return false;
    const { configured, action } = await status.json();
    if (!configured || action !== mode) return false;

    // Keep the issuer's cookies in the browser. The redirect chain runs as a
    // request, so the current document and its URL never change.
    const query = new URLSearchParams({ mode, return_to: "/auth/session-complete" });
    await fetch("/api/sso/start?" + query, {
      credentials: "include",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return !controller.signal.aborted;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
