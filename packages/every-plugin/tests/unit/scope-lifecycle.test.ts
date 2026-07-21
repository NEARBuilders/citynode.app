import { createPlugin, createPluginRuntime } from "every-plugin";
import { Context, Effect, Layer, Scope } from "every-plugin/effect";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { describe, expect, it } from "vitest";

const testContract = oc.router({
  ping: oc
    .route({ method: "GET", path: "/ping" })
    .output(z.object({ ok: z.boolean() })),
});

describe("Scope lifecycle", () => {
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
            () => Effect.sync(() => { released = true; }),
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

  it("Layer.scoped resources persist after usePlugin with Effect.provide", async () => {
    let released = false;

    class TestTag extends Context.Tag("ScopeTestTag")<
      TestTag,
      { value: string }
    >() {}

    const TestLive = Layer.scoped(
      TestTag,
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => "acquired"),
          () => Effect.sync(() => { released = true; }),
        );
        return { value: "live" };
      }),
    );

    const testPlugin = createPlugin({
      variables: z.object({}),
      secrets: z.object({}),
      contract: testContract,
      initialize: () =>
        Effect.gen(function* () {
          // Simulate the real plugin pattern:
          // Effect.provide with a Layer.scoped layer
          const svc = yield* Effect.provide(TestTag, TestLive);
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
              () => Effect.sync(() => { releases.push(id); }),
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
        "a": { module: makePlugin("a") },
        "b": { module: makePlugin("b") },
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
});
