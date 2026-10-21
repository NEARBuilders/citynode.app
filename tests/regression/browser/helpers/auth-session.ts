import { execFileSync } from "node:child_process";
import type { BrowserContext } from "@playwright/test";
import { addSessionCookies, cookiesFromHeader } from "../../lib/playwright-cookies.mjs";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";

const { baseUrl } = computeRegressionEnv();

// A wedged server endpoint must fail the test with a named error instead of
// hanging the suite for minutes — every regression fetch carries a deadline.
export const FETCH_TIMEOUT_MS = 15_000;

export async function authFetch(path: string, cookie: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin: baseUrl, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

export function markEmailVerified(userId: string) {
  execFileSync("pnpm", ["exec", "tsx", "tests/regression/lib/verify-test-emails.ts", userId], {
    timeout: FETCH_TIMEOUT_MS,
  });
}

export async function signInAnonymously() {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`anonymous sign-in failed: ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/**
 * Production enables better-auth's session cookie cache: the `session_data`
 * cookie is a snapshot from the last fresh session read, so server-side
 * mutations made OUT OF BAND (a fixture's raw accept-invitation, not the
 * app's synchronize path) are invisible for the 5-minute cache window. A
 * cache-disabled get-session re-reads the DB and refreshes the cache cookie —
 * merge its Set-Cookie pairs over the jar like a real cookie jar: same-name
 * replaces, an empty-valued pair deletes, and the rest (the session token —
 * which the refresh does not re-issue) survives.
 */
export async function refreshSessionCookies(cookie: string) {
  const response = await fetch(`${baseUrl}/api/auth/get-session?disableCookieCache=true`, {
    headers: { cookie, origin: baseUrl },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`session refresh failed: ${response.status}`);

  const jar = new Map(cookie.split("; ").map((pair) => [pair.slice(0, pair.indexOf("=")), pair]));
  for (const pair of response.headers.getSetCookie().map((value) => value.split(";")[0])) {
    const name = pair.slice(0, pair.indexOf("="));
    const value = pair.slice(pair.indexOf("=") + 1);
    if (value.length === 0) jar.delete(name);
    else jar.set(name, pair);
  }
  const merged = [...jar.values()].join("; ");
  if (
    !merged.includes("better-auth.session_token=") &&
    !merged.includes("__Secure-better-auth.session_token=")
  ) {
    throw new Error(`refreshed cookie set lost the session token: ${merged.slice(0, 200)}`);
  }
  return merged;
}

export async function useCookieHeader(context: BrowserContext, cookieHeader: string) {
  await addSessionCookies(context, cookiesFromHeader(cookieHeader), baseUrl);
}
