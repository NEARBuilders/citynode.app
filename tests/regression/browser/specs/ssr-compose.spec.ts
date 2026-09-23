import { expect, test } from "@playwright/test";

/**
 * SSR compose pin — the dev project boots `bos dev --ssr`, so the served HTML
 * is the host's manifest-composed render. These assertions check the raw
 * server HTML (request API — no client JS) so a compose fallback to the
 * core-only shell fails loudly. The /login route declares `ssr: false`, so
 * its value here is the compose payload embedded for client hydration; the
 * server-rendered content pin uses /about, a core route.
 */
test.describe("SSR compose", () => {
  test("served /login HTML embeds the composed payload with the auth remote", async ({
    request,
  }) => {
    const response = await request.get("/login");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html, "page must be server-rendered").toContain("data-everything-ssr");
    expect(html, "SSR must embed a compose payload").toContain('"compose"');
    expect(html, "compose payload must include the auth-ui remote").toContain("auth-ui");
  });

  test("a core route is server-rendered with content (not the CSR shell)", async ({ request }) => {
    const response = await request.get("/about");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html, "page must be server-rendered").toContain("data-everything-ssr");
    expect(html, "/about content must be server-rendered").toContain("about.open-skill-link");
    expect(html, "SSR must embed a compose payload").toContain('"compose"');
  });
});
