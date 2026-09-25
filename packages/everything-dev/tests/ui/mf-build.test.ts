import { describe, expect, it } from "vitest";
import { CORE_UI_DEPLOY_FIELDS, createUiSharedDeps } from "../../src/ui/mf-build";

const pkg = {
  dependencies: {
    react: "catalog:",
    "react-dom": "catalog:",
    "@orpc/client": "catalog:",
    "@orpc/contract": "catalog:",
    "@tanstack/react-query": "catalog:",
    "@tanstack/react-router": "catalog:",
  },
};

describe("createUiSharedDeps", () => {
  it("resolves requiredVersion from the installed package version", () => {
    const deps = createUiSharedDeps(pkg);
    expect(Object.keys(deps).sort()).toEqual([
      "@orpc/client",
      "@orpc/contract",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "react",
      "react-dom",
    ]);
    expect(deps.react.singleton).toBe(true);
    expect(deps.react.eager).toBe(false);
    expect(deps.react.requiredVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(deps.react.strictVersion).toBe(true);
  });

  it("can relax strictVersion (core-shell parity mode)", () => {
    const deps = createUiSharedDeps(pkg, { strictVersion: false });
    expect(deps.react.requiredVersion).toBe(false);
    expect(deps.react.strictVersion).toBe(false);
  });

  it("prefers the installed version over the declared range", () => {
    const deps = createUiSharedDeps({ dependencies: { react: "19.1.0" } });
    expect(deps.react.requiredVersion).toBe("19.2.4");
  });

  it("consumer role sets import: false — no bundled fallback copy", () => {
    const provider = createUiSharedDeps(pkg, { role: "provider" });
    const consumer = createUiSharedDeps(pkg, { role: "consumer" });
    expect(provider.react.import).toBeUndefined();
    expect(consumer.react.import).toBe(false);
    expect(consumer.react).toMatchObject({ singleton: true, eager: false, strictVersion: true });
  });
});

describe("CORE_UI_DEPLOY_FIELDS", () => {
  it("names the app.ui.* fields", () => {
    expect(CORE_UI_DEPLOY_FIELDS.urlField).toBe("app.ui.production");
    expect(CORE_UI_DEPLOY_FIELDS.ssrUrlField).toBe("app.ui.ssr");
  });
});
