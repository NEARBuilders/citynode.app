import { describe, expect, it } from "vitest";
import {
  applyDeployResults,
  applyPluginPublishUrl,
  platformUrlDeployEntries,
  pluginUiUrlDeployEntries,
} from "../../src/platform-deploy";

describe("platformUrlDeployEntries (image-native)", () => {
  const ORIGIN = "https://citynode.app";
  const BASE = `${ORIGIN}/bundles/v1.citynode.near/citynode.app`;

  it("writes production + integrity fields with no integrity value", () => {
    const entries = platformUrlDeployEntries({
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "ui",
      kind: "app",
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      url: `${BASE}/ui/`,
      urlField: "app.ui.production",
      integrityField: "app.ui.integrity",
    });
    // integrity omitted — applyDeployResults deletes stale pipeline hashes
    expect(entries[0].integrity).toBeUndefined();
  });

  it("derives the SSR container URL for the ui slot", () => {
    const entries = platformUrlDeployEntries({
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "ui",
      kind: "app",
    });
    expect(entries[1]).toEqual({
      url: `${BASE}/ui/ssr/`,
      urlField: "app.ui.ssr",
      integrityField: "app.ui.ssrIntegrity",
    });
  });

  it("maps plugins to the plugins slot without ssr", () => {
    const entries = platformUrlDeployEntries({
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "votes",
      kind: "plugin",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      url: `${BASE}/votes/`,
      urlField: "plugins.votes.production",
      integrityField: "plugins.votes.integrity",
    });
  });
});

describe("pluginUiUrlDeployEntries (folder-form plugin ui)", () => {
  const ORIGIN = "https://citynode.app";
  const BASE = `${ORIGIN}/bundles/v1.citynode.near/citynode.app`;

  it("pins app.<key>.ui.* fields for an app-slot plugin", () => {
    const entries = pluginUiUrlDeployEntries({
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "auth",
      kind: "app",
      integrity: "sha384-web",
      ssrIntegrity: "sha384-ssr",
    });
    expect(entries).toEqual([
      {
        url: `${BASE}/auth-ui/`,
        integrity: "sha384-web",
        urlField: "app.auth.ui.production",
        integrityField: "app.auth.ui.integrity",
      },
      {
        url: `${BASE}/auth-ui/ssr/`,
        integrity: "sha384-ssr",
        urlField: "app.auth.ui.ssr",
        integrityField: "app.auth.ui.ssrIntegrity",
      },
    ]);
  });

  it("pins plugins.<id>.ui.* fields for a plugins-slot entry", () => {
    const entries = pluginUiUrlDeployEntries({
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "votes",
      kind: "plugin",
    });
    expect(entries[0]).toMatchObject({
      url: `${BASE}/votes-ui/`,
      urlField: "plugins.votes.ui.production",
      integrityField: "plugins.votes.ui.integrity",
    });
  });

  it("merges into an existing ui entry without clobbering name/development", () => {
    const config = {
      account: "v1.citynode.near",
      domain: "citynode.app",
      app: {
        auth: {
          development: "local:plugins/auth",
          ui: { name: "auth-ui", development: "local:plugins/auth/ui" },
        },
      },
    };

    const merged = applyDeployResults(
      config,
      pluginUiUrlDeployEntries({
        origin: ORIGIN,
        account: "v1.citynode.near",
        gateway: "citynode.app",
        key: "auth",
        kind: "app",
        integrity: "sha384-web",
        ssrIntegrity: "sha384-ssr",
      }),
    );

    const authUi = (merged.app as Record<string, Record<string, unknown>>).auth
      .ui as Record<string, unknown>;
    expect(authUi.name).toBe("auth-ui");
    expect(authUi.development).toBe("local:plugins/auth/ui");
    expect(authUi.production).toBe(`${BASE}/auth-ui/`);
    expect(authUi.integrity).toBe("sha384-web");
    expect(authUi.ssr).toBe(`${BASE}/auth-ui/ssr/`);
    expect(authUi.ssrIntegrity).toBe("sha384-ssr");
  });
});

describe("applyPluginPublishUrl (image-native plugin publish)", () => {
  const ORIGIN = "https://citynode.app";

  it("sets the deterministic bundle URL and deletes stale integrity", () => {
    const config = {
      account: "v1.citynode.near",
      domain: "citynode.app",
      plugins: {
        votes: {
          development: "local:plugins/votes",
          production: "https://stale.example.com/votes/",
          integrity: "sha384-stale",
        },
      },
    };

    const merged = applyPluginPublishUrl(config, {
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "votes",
    });

    expect(merged).not.toBe(config);
    const votes = (merged.plugins as Record<string, Record<string, unknown>>).votes;
    expect(votes?.production).toBe(`${ORIGIN}/bundles/v1.citynode.near/citynode.app/votes/`);
    expect(votes?.integrity).toBeUndefined();
    expect(votes?.development).toBe("local:plugins/votes");
  });

  it("creates the plugins entry when absent and never touches other slots", () => {
    const config = {
      account: "v1.citynode.near",
      domain: "citynode.app",
      app: { ui: { production: "https://elsewhere/ui/" } },
    };

    const merged = applyPluginPublishUrl(config, {
      origin: ORIGIN,
      account: "v1.citynode.near",
      gateway: "citynode.app",
      key: "auth",
    });

    const plugins = merged.plugins as Record<string, Record<string, unknown>>;
    expect(plugins.auth?.production).toBe(`${ORIGIN}/bundles/v1.citynode.near/citynode.app/auth/`);
    expect((merged.app as Record<string, unknown>).ui).toBeDefined();
  });
});
