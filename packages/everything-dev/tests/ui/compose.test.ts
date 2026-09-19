import type { AnyRoute } from "@tanstack/react-router";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { collectCoreMounts, composeApp } from "../../src/ui/compose/compose";
import { defineUiPlugin } from "../../src/ui/compose/define";
import type { MountId } from "../../src/ui/compose/mount-registry";
import { MOUNTS } from "../../src/ui/compose/mount-registry";
import { routeFullPath } from "../../src/ui/compose/nav";

const layoutRoute = (id: string, parent: () => AnyRoute): AnyRoute =>
  createRoute({
    id,
    getParentRoute: parent,
    component: () => null,
  } as never) as unknown as AnyRoute;

const leafRoute = (
  path: string,
  parent: () => AnyRoute,
  staticData?: Record<string, unknown>,
): AnyRoute =>
  createRoute({
    path,
    getParentRoute: parent,
    component: () => null,
    staticData,
  } as never) as unknown as AnyRoute;

function buildCoreTree(): { tree: AnyRoute; publicMount: AnyRoute; dashboardMount: AnyRoute } {
  const root = createRootRoute({ component: () => null });
  const layout = layoutRoute("_layout", () => root);
  const anon = layoutRoute("_anon", () => layout);
  const publicMount = layoutRoute("_public", () => layout);
  const authed = layoutRoute("_authenticated", () => layout);
  const dashboardMount = layoutRoute("_dashboard", () => authed);
  const admin = layoutRoute("_admin", () => layout);
  const adminDashboard = layoutRoute("_dashboard", () => admin);

  const layoutChildren = [anon, publicMount, authed, admin];
  (layout as unknown as { children?: AnyRoute[] }).children = layoutChildren;
  (authed as unknown as { children?: AnyRoute[] }).children = [dashboardMount];
  (admin as unknown as { children?: AnyRoute[] }).children = [adminDashboard];
  (root as unknown as { children?: AnyRoute[] }).children = [layout];

  return { tree: root, publicMount, dashboardMount };
}

describe("composeApp", () => {
  it("collects core mounts by layout id", () => {
    const core = buildCoreTree();
    const mounts = collectCoreMounts(core.tree);
    expect(mounts.get("public")?.matches[0]).toBe(core.publicMount);
    expect(mounts.get("dashboard")?.matches).toHaveLength(2);
  });

  it("returns the core tree untouched with no plugins", () => {
    const core = buildCoreTree();
    const result = composeApp(core.tree, []);
    expect(result.routeTree).toBe(core.tree);
    expect(result.mountCounts).toEqual({});
    expect(result.pluginMounts).toEqual({});
    expect(result.nav.items).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("grafts a plugin subtree onto its matching core mount", () => {
    const core = buildCoreTree();

    const pluginRoot = createRootRoute({ component: () => null });
    const pluginDashboard = layoutRoute("_dashboard", () => pluginRoot);
    const billing = leafRoute("/billing", () => pluginDashboard);
    (pluginDashboard as unknown as { children?: AnyRoute[] }).children = [billing];
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginDashboard];
    const pluginTree = pluginRoot;

    const result = composeApp(core.tree, [{ name: "settings", tree: pluginTree }]);

    expect(result.mountCounts).toEqual({ dashboard: 1 });
    expect(result.pluginMounts).toEqual({ settings: { dashboard: 1 } });
    const grafted = (core.dashboardMount as unknown as { children?: AnyRoute[] }).children?.[0];
    expect(grafted?.options?.id).toBe("settings__dashboard");
    expect(grafted?.options?.getParentRoute?.()).toBe(core.dashboardMount);
  });

  it("warns when a core mount is declared twice and attaches to the first", () => {
    const core = buildCoreTree();

    const pluginRoot = createRootRoute({ component: () => null });
    const pluginDashboard = layoutRoute("_dashboard", () => pluginRoot);
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginDashboard];

    const result = composeApp(core.tree, [{ name: "settings", tree: pluginRoot }]);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('mount "_dashboard"');
    expect(
      (core.dashboardMount as unknown as { children?: AnyRoute[] }).children?.[0]?.options?.id,
    ).toBe("settings__dashboard");
  });

  it("ignores plugin subtree roots that declare unknown mounts", () => {
    const core = buildCoreTree();

    const pluginRoot = createRootRoute({ component: () => null });
    const secret = layoutRoute("_secret", () => pluginRoot);
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [secret];

    const result = composeApp(core.tree, [{ name: "widgets", tree: pluginRoot }]);
    expect(result.mountCounts).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it("grafts plugins in ascending-name order (deterministic first-wins)", () => {
    const core = buildCoreTree();

    const makePublicPlugin = (parentName: string): AnyRoute => {
      const pluginRoot = createRootRoute({ component: () => null });
      const pluginPublic = layoutRoute("_public", () => pluginRoot);
      const blog = leafRoute("/blog", () => pluginPublic);
      (pluginPublic as unknown as { children?: AnyRoute[] }).children = [blog];
      (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginPublic];
      void parentName;
      return pluginRoot;
    };

    const zebra = { name: "zebra", tree: makePublicPlugin("zebra") };
    const alpha = { name: "alpha", tree: makePublicPlugin("alpha") };

    const result = composeApp(core.tree, [zebra, alpha]);
    expect(result.mountCounts).toEqual({ public: 2 });
    const grafted = (core.publicMount as unknown as { children?: AnyRoute[] }).children ?? [];
    expect(grafted[0]?.options?.id).toBe("alpha__public");
    expect(grafted[1]?.options?.id).toBe("zebra__public");
  });

  it("recomposition is idempotent (no duplicate grafts on repeated compose)", () => {
    const core = buildCoreTree();

    const pluginRoot = createRootRoute({ component: () => null });
    const pluginDashboard = layoutRoute("_dashboard", () => pluginRoot);
    const billing = leafRoute("/billing", () => pluginDashboard);
    (pluginDashboard as unknown as { children?: AnyRoute[] }).children = [billing];
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginDashboard];

    composeApp(core.tree, [{ name: "settings", tree: pluginRoot }]);
    composeApp(core.tree, [{ name: "settings", tree: pluginRoot }]);

    const grafted = (core.dashboardMount as unknown as { children?: AnyRoute[] }).children ?? [];
    expect(grafted).toHaveLength(1);
  });

  it("accepts alias mount declarations (_auth → authenticated) and skips unknown plugin mounts", () => {
    const core = buildCoreTree();

    const legacyRoot = createRootRoute({ component: () => null });
    const legacyAuth = layoutRoute("_auth", () => legacyRoot);
    (legacyRoot as unknown as { children?: AnyRoute[] }).children = [legacyAuth];

    const result = composeApp(core.tree, [{ name: "legacy", tree: legacyRoot }]);
    expect(result.pluginMounts).toEqual({ legacy: { authenticated: 1 } });
  });

  it("derives the nav manifest from grafted subtree staticData.nav", () => {
    const core = buildCoreTree();

    const pluginRoot = createRootRoute({ component: () => null });
    const pluginDashboard = layoutRoute("_dashboard", () => pluginRoot);
    const billing = leafRoute("/billing", () => pluginDashboard, {
      nav: { label: "Billing", order: 2, group: "Account" },
    });
    const keys = leafRoute("/keys", () => pluginDashboard, {
      nav: { label: "API Keys", order: 1, icon: "key" },
    });
    const debug = leafRoute("/debug", () => pluginDashboard, {
      nav: { label: "Debug", hidden: true },
    });
    (pluginDashboard as unknown as { children?: AnyRoute[] }).children = [billing, keys, debug];
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginDashboard];

    const result = composeApp(core.tree, [{ name: "auth", tree: pluginRoot }]);
    expect(result.nav.items.map((item) => item.label)).toEqual(["API Keys", "Billing"]);
    expect(result.nav.items[0]?.icon).toBe("key");
    expect(result.nav.items[1]?.group).toBe("Account");
    expect(result.nav.items.some((item) => item.label === "Debug")).toBe(false);
  });

  it("resolves nav link targets from the reparented chain", () => {
    const core = buildCoreTree();

    const pluginRoot = createRootRoute({ component: () => null });
    const pluginDashboard = layoutRoute("_dashboard", () => pluginRoot);
    const billing = leafRoute("/billing", () => pluginDashboard, {
      nav: { label: "Billing" },
    });
    const paramPage = leafRoute("/nodes/$nodeId/content", () => pluginDashboard, {
      nav: { label: "Node", to: "/nodes" },
    });
    (pluginDashboard as unknown as { children?: AnyRoute[] }).children = [billing, paramPage];
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginDashboard];

    composeApp(core.tree, [{ name: "nodes", tree: pluginRoot }]);
    expect(routeFullPath(billing)).toBe("/billing");
    expect(routeFullPath(paramPage)).toBe("/nodes/$nodeId/content");
  });

  it("never mutates the cached plugin tree (graft is a copy, recomposable under a different mount)", () => {
    const buildPluginTree = (): AnyRoute => {
      const pluginRoot = createRootRoute({ component: () => null });
      const pluginPublic = layoutRoute("_public", () => pluginRoot);
      (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginPublic];
      return pluginRoot;
    };

    const pluginTree = buildPluginTree();
    const pluginPublic = (pluginTree as unknown as { children?: AnyRoute[] })
      .children?.[0] as unknown as { options?: { id?: string } };

    const coreA = buildCoreTree();
    composeApp(coreA.tree, [{ name: "blog", tree: pluginTree }]);
    expect(pluginPublic.options?.id).toBe("_public");

    const coreB = buildCoreTree();
    const recomposed = composeApp(coreB.tree, [{ name: "blog", tree: pluginTree }]);
    expect(recomposed.pluginMounts).toEqual({ blog: { public: 1 } });
    expect(pluginPublic.options?.id).toBe("_public");

    const grafted = (coreB.publicMount as unknown as { children?: AnyRoute[] }).children?.[0];
    expect(grafted?.options?.id).toBe("blog__public");
    expect(grafted).not.toBe(pluginTree);
  });
});

describe("MOUNTS", () => {
  it("exposes the canonical mount ids of the registry", () => {
    expect(MOUNTS).toEqual([
      "public",
      "anon",
      "authenticated",
      "dashboard",
      "admin",
      "organization",
    ]);
  });
});

describe("defineUiPlugin", () => {
  const buildPluginTree = (): { tree: AnyRoute; mount: AnyRoute } => {
    const pluginRoot = createRootRoute({ component: () => null });
    const pluginDashboard = layoutRoute("_dashboard", () => pluginRoot);
    const billing = leafRoute("/billing", () => pluginDashboard);
    (pluginDashboard as unknown as { children?: AnyRoute[] }).children = [billing];
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginDashboard];
    return { tree: pluginRoot, mount: pluginDashboard };
  };

  it("produces a module composeApp grafts like a raw tree", () => {
    const core = buildCoreTree();
    const { tree } = buildPluginTree();

    const mod = defineUiPlugin({ name: "settings", mounts: ["dashboard"], tree });
    const result = composeApp(core.tree, [mod]);

    expect(result.pluginMounts).toEqual({ settings: { dashboard: 1 } });
    const grafted = (core.dashboardMount as unknown as { children?: AnyRoute[] }).children?.[0];
    expect(grafted?.options?.id).toBe("settings__dashboard");
    expect(grafted?.options?.getParentRoute?.()).toBe(core.dashboardMount);
  });

  it("accepts alias roots resolved to a declared mount (_auth → authenticated)", () => {
    const core = buildCoreTree();
    const pluginRoot = createRootRoute({ component: () => null });
    const pluginAuth = layoutRoute("_auth", () => pluginRoot);
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginAuth];

    const mod = defineUiPlugin({ name: "legacy", mounts: ["authenticated"], tree: pluginRoot });
    const result = composeApp(core.tree, [mod]);

    expect(result.pluginMounts).toEqual({ legacy: { authenticated: 1 } });
  });

  it("does not throw for root children that are not mount declarations", () => {
    const pluginRoot = createRootRoute({ component: () => null });
    const stray = leafRoute("/stray", () => pluginRoot);
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [stray];

    const core = buildCoreTree();
    const mod = defineUiPlugin({ name: "widgets", mounts: ["dashboard"], tree: pluginRoot });
    const result = composeApp(core.tree, [mod]);

    expect(result.pluginMounts).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it("throws when a root declares a valid mount that is not in def.mounts", () => {
    const pluginRoot = createRootRoute({ component: () => null });
    const pluginPublic = layoutRoute("_public", () => pluginRoot);
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [pluginPublic];

    expect(() =>
      defineUiPlugin({ name: "settings", mounts: ["dashboard"], tree: pluginRoot }),
    ).toThrow(/_public/);
  });

  it("throws when a root declares an unknown mount (typo)", () => {
    const pluginRoot = createRootRoute({ component: () => null });
    const typo = layoutRoute("_dashbord", () => pluginRoot);
    (pluginRoot as unknown as { children?: AnyRoute[] }).children = [typo];

    expect(() =>
      defineUiPlugin({ name: "settings", mounts: ["dashboard"], tree: pluginRoot }),
    ).toThrow(/_dashbord.*dashboard|dashboard.*_dashbord/s);
  });

  it("rejects mount typos at compile time", () => {
    const { tree } = buildPluginTree();

    const bad = () =>
      defineUiPlugin({
        name: "settings",
        // @ts-expect-error "dashbord" is not a MountId
        mounts: ["dashbord"],
        tree,
      });
    void bad;
  });

  it("rejects unknown mount names at runtime for untyped (JS) consumers", () => {
    const { tree } = buildPluginTree();

    expect(() =>
      defineUiPlugin({
        name: "settings",
        mounts: ["dashbord"] as unknown as MountId[],
        tree,
      }),
    ).toThrow(/dashbord/);
  });

  it("keeps the raw-tree fallback composing (no WeakMap entry)", () => {
    const core = buildCoreTree();
    const { tree } = buildPluginTree();

    const result = composeApp(core.tree, [{ name: "settings", tree }]);

    expect(result.pluginMounts).toEqual({ settings: { dashboard: 1 } });
  });
});
