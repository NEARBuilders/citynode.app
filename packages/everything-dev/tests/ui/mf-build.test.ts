import { describe, expect, it } from "vitest";
import {
  CORE_UI_DEPLOY_FIELDS,
  createUiSharedDeps,
  isUiServerBuild,
  pluginUiDeployFields,
} from "../../src/ui/mf-build";

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
});

describe("pluginUiDeployFields", () => {
  it("names the plugins.<id>.ui.* fields", () => {
    expect(pluginUiDeployFields("auth")).toEqual({
      urlField: "plugins.auth.ui.production",
      integrityField: "plugins.auth.ui.integrity",
      ssrUrlField: "plugins.auth.ui.ssr",
      ssrIntegrityField: "plugins.auth.ui.ssrIntegrity",
    });
    expect(CORE_UI_DEPLOY_FIELDS.urlField).toBe("app.ui.production");
  });

  it("reads the current build target flag", () => {
    const was = process.env.BUILD_TARGET;
    process.env.BUILD_TARGET = "server";
    expect(isUiServerBuild()).toBe(true);
    process.env.BUILD_TARGET = "client";
    expect(isUiServerBuild()).toBe(false);
    if (was === undefined) delete process.env.BUILD_TARGET;
    else process.env.BUILD_TARGET = was;
  });
});
