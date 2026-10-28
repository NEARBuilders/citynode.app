import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asSetCookieValue,
  cookiesFromHeader,
  fixtureAuthCookieOptions,
  toPlaywrightCookies,
} from "./playwright-cookies.mjs";

void test("maps fixture cookies onto the stack origin instead of a localhost domain", () => {
  const [cookie] = toPlaywrightCookies(
    [
      {
        name: "better-auth.session_token",
        value: "tok.sig+/=",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        expires: 1_800_000_000,
      },
    ],
    "http://localhost:4100",
  );
  assert.equal(cookie.url, "http://localhost:4100");
  assert.equal(cookie.value, "tok.sig%2B%2F%3D");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Lax");
  assert.equal(cookie.expires, 1_800_000_000);
  assert.equal("domain" in cookie, false);
  assert.equal("path" in cookie, false);
  assert.equal("secure" in cookie, false);
});

void test("does not double-encode values the live server already percent-encoded", () => {
  assert.equal(asSetCookieValue("tok.sig%2B%3D"), "tok.sig%2B%3D");
  assert.equal(asSetCookieValue("tok.sig+/="), "tok.sig%2B%2F%3D");
});

void test("keeps Secure cookies when the stack origin is https", () => {
  const [cookie] = toPlaywrightCookies(
    [{ name: "__Secure-better-auth.session_token", value: "tok.sig" }],
    "https://citynode.app",
  );
  assert.equal(cookie.url, "https://citynode.app");
  assert.equal("secure" in cookie, false);
});

void test("parses a cookie header into Playwright entries", () => {
  const cookies = cookiesFromHeader(
    "better-auth.session_token=abc; better-auth.session_data=cached",
  );
  assert.deepEqual(cookies, [
    { name: "better-auth.session_token", value: "abc" },
    { name: "better-auth.session_data", value: "cached" },
  ]);
});

void test("fixture cookie options follow the stack protocol, not NODE_ENV", () => {
  assert.equal(fixtureAuthCookieOptions("http://localhost:4100").useSecureCookies, false);
  assert.equal(fixtureAuthCookieOptions("https://citynode.app").useSecureCookies, true);
});
