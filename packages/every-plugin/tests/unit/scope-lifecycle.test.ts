import { createPlugin, createPluginRuntime } from "every-plugin";
import { Context, Effect, Layer } from "every-plugin/effect";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { describe, expect, it } from "vitest";

const testContract = oc.router({
  ping: oc.route({ method: "GET", path: "/ping" }).output(z.object({ ok: z.boolean() })),
});

describe("Scope lifecycle", () => {
  it("tools.buildService resources persist after plugin initialization", async () => {
    let released = false;

    class TestTag extends Context.Tag("TestTag")<TestTag, { value: string }>() {}

    const TestLive = Layer.scoped(
      TestTag,
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => ({ value: "live" })),
          () =>
            Effect.sync(() => {
              released = true;
            }),
        );
        return { value: "live" };
      }),
    );

    const testPlugin = createPlugin({
      variables: z.object({}),
      secrets: z.object({}),
      contract: testContract,
      initialize: (_config, _plugins, tools) =>
        Effect.gen(function* () {
          const svc = yield* tools!.buildService(TestTag, TestLive);
          return { svc };
        }),
      createRouter: (_deps, builder) => ({
        ping: builder.ping.handler(async () => ({ ok: true })),
      }),
    });

    const runtime = createPluginRuntime({
      registry: { "scope-test": { module: testPlugin } },
      secrets: {},
    });

    const result = await runtime.usePlugin("scope-test", {
      variables: {},
      secrets: {},
    });

    expect(result).toBeDefined();
    expect(released).toBe(false);

    await runtime.shutdown();

    expect(released).toBe(true);
  });

  it("acquireRelease resources persist after plugin initialization", async () => {
    let released = false;

    const testPlugin = createPlugin({
      variables: z.object({}),
      secrets: z.object({}),
      contract: testContract,
      initialize: () =>
        Effect.gen(function* () {
          yield* Effect.acquireRelease(
            Effect.sync(() => ({ connected: true })),
            () =>
              Effect.sync(() => {
                released = true;
              }),
          );
          return { ready: true };
        }),
      createRouter: (_deps, builder) => ({
        ping: builder.ping.handler(async () => ({ ok: true })),
      }),
    });

    const runtime = createPluginRuntime({
      registry: { "scope-test": { module: testPlugin } },
      secrets: {},
    });

    const result = await runtime.usePlugin("scope-test", {
      variables: {},
      secrets: {},
    });

    expect(result).toBeDefined();
    expect(released).toBe(false);

    await runtime.shutdown();

    expect(released).toBe(true);
  });

  it("independent plugins have independent scopes", async () => {
    const releases: string[] = [];

    function makePlugin(id: string) {
      return createPlugin({
        variables: z.object({}),
        secrets: z.object({}),
        contract: testContract,
        initialize: () =>
          Effect.gen(function* () {
            yield* Effect.acquireRelease(
              Effect.sync(() => ({ id })),
              () =>
                Effect.sync(() => {
                  releases.push(id);
                }),
            );
            return { id };
          }),
        createRouter: (_deps, builder) => ({
          ping: builder.ping.handler(async () => ({ ok: true })),
        }),
      });
    }

    const runtime = createPluginRuntime({
      registry: {
        a: { module: makePlugin("a") },
        b: { module: makePlugin("b") },
      },
      secrets: {},
    });

    await runtime.usePlugin("a", { variables: {}, secrets: {} });
    await runtime.usePlugin("b", { variables: {}, secrets: {} });

    expect(releases).toEqual([]);

    await runtime.shutdown();

    expect(releases).toHaveLength(2);
    expect(releases).toContain("a");
    expect(releases).toContain("b");
  });

  it("runtime.shutdown() cleans up all registered plugins", async () => {
    const shutdownLog: string[] = [];

    const testPlugin = createPlugin({
      variables: z.object({}),
      secrets: z.object({}),
      contract: testContract,
      initialize: () =>
        Effect.gen(function* () {
          yield* Effect.acquireRelease(
            Effect.sync(() => ({ ready: true })),
            () =>
              Effect.sync(() => {
                shutdownLog.push("released");
              }),
          );
          return { ready: true };
        }),
      shutdown: () =>
        Effect.sync(() => {
          shutdownLog.push("shutdown");
        }),
      createRouter: (_deps, builder) => ({
        ping: builder.ping.handler(async () => ({ ok: true })),
      }),
    });

    const runtime = createPluginRuntime({
      registry: { "shutdown-test": { module: testPlugin } },
      secrets: {},
    });

    await runtime.usePlugin("shutdown-test", {
      variables: {},
      secrets: {},
    });

    await runtime.shutdown();

    expect(shutdownLog).toContain("released");
    expect(shutdownLog.indexOf("shutdown")).toBeLessThanOrEqual(shutdownLog.indexOf("released"));
  });
});
