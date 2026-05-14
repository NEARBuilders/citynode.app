import { Effect } from "every-plugin/effect";
import { beforeAll, describe, expect, it } from "vitest";
import { loadRouterModule } from "@/services/federation.server";
import type { RouterModule, RuntimeConfig } from "@/types";
import { createTestApiClient } from "../helpers/api-client";
import {
  buildTestRenderOptions,
  buildTestRouteHeadContext,
  createMockAuthClient,
  loadTestRuntimeConfig,
} from "../helpers/runtime-config";

async function consumeStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  html += decoder.decode();
  return html;
}

const mockApiClient = createTestApiClient({});
const mockAuthClient = createMockAuthClient();

describe("SSR Stream Lifecycle", () => {
  let routerModule: RouterModule;
  let config: RuntimeConfig;

  beforeAll(async () => {
    config = await loadTestRuntimeConfig();
    routerModule = await Effect.runPromise(loadRouterModule(config));
  });

  describe("Stream Completion", () => {
    it("completes stream for root route without timeout", async () => {
      const startTime = Date.now();

      const head = await routerModule.getRouteHead("/", buildTestRouteHeadContext(config));

      const elapsed = Date.now() - startTime;

      expect(head).toBeDefined();
      expect(head.meta).toBeDefined();
      expect(elapsed).toBeLessThan(5000);
    });

    // NOTE: Authenticated routes are configured with `ssr: false` in the demo UI.
  });

  describe("SSR Configuration", () => {
    it("renders layout route metadata", async () => {
      const head = await routerModule.getRouteHead("/", buildTestRouteHeadContext(config));

      const titleMeta = head.meta.find((m) => m && typeof m === "object" && "title" in m);
      expect(titleMeta).toBeDefined();
    });

    // NOTE: Auth routes behavior depends on auth strategy.
  });

  describe("SSR Routes", () => {
    const STREAM_TIMEOUT = 5000;

    it("renders root route with full SSR", { timeout: 6000 }, async () => {
      const request = new Request("http://localhost/");
      const startTime = Date.now();

      const result = await routerModule.renderToStream(
        request,
        buildTestRenderOptions(config, mockApiClient, mockAuthClient),
      );

      const html = await consumeStream(result.stream);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(STREAM_TIMEOUT);
      expect(result.statusCode).toBe(200);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
      expect(html).toContain(config.account);
    });
  });

  describe("Full Stream Rendering", () => {
    const STREAM_TIMEOUT = 5000;

    it("completes full stream render for root route", { timeout: 6000 }, async () => {
      const request = new Request("http://localhost/");
      const startTime = Date.now();

      const result = await routerModule.renderToStream(
        request,
        buildTestRenderOptions(config, mockApiClient, mockAuthClient),
      );

      const html = await consumeStream(result.stream);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(STREAM_TIMEOUT);
      expect(result.statusCode).toBe(200);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
    });

    // NOTE: Product routes are not part of the current demo UI.
  });
});
