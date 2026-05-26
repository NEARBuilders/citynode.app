---
"everything-dev": patch
"ui": patch
"host": patch
---

Pass CSP nonce through SSR pipeline and redirect UI assets instead of proxying to fix Cloudflare Error 1000

**CSP nonce passthrough (production CSP script/style blocking fix):**

The host generated a CSP nonce per request but never forwarded it to TanStack Router's SSR renderer, causing all inline scripts and styles to be blocked by `script-src 'nonce-...' 'strict-dynamic'` in production.

- **everything-dev/types**: Add `cspNonce?: string` to `CreateRouterOptions` and `RenderOptions` interfaces
- **everything-dev/types**: Add `cspNonce` to `RenderOptionsWithApi` (inherited from `RenderOptions`)
- **ui/router.server**: Forward `cspNonce` to TanStack Router as `ssr: { nonce }` in `createRouter` and `renderToStream`
- **ui/__root**: Apply `nonce` from `useRouter().options.ssr?.nonce` to the `<style>` tag for base styles
- **host/program**: Remove `as any` cast from `renderToStream` call — `cspNonce` is now a typed property
- **host/tests**: Add regression tests verifying nonce appears on `<script>` and `<style>` tags when `cspNonce` is provided

**Cloudflare Error 1000 fix (static asset 403s):**

When both the host (Railway behind Cloudflare) and UI deployment (Zephyr Cloud behind Cloudflare) are orange-clouded, server-to-server proxying triggers Cloudflare Error 1000 "DNS points to prohibited IP". Browser requests to Zephyr Cloud work fine; only the host's `fetch()` proxy was blocked.

- **host/program**: Replace `proxyUiAssetRequest` (server-to-server `fetch` proxy) with `redirectUiAssetRequest` (HTTP 302 redirect). The browser follows the redirect directly to the Zephyr Cloud origin, bypassing the Cloudflare-to-Cloudflare proxy loop
- **ui/style-chrome**: Prefix rspack-imported `built_on.png` and `built_on_rev.png` with `assetsUrl` from runtime config so images load directly from the UI deployment origin instead of through the host
- **ui/skill**: Use `assetsUrl` instead of `hostUrl` to fetch `/skill.md` directly from the UI origin
- **host/tests**: Update `ui-public-assets.test.ts` — all UI asset tests now verify 302 redirect behavior instead of proxied content