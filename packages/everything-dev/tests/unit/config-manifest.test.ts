import { describe, expect, it } from "vitest";
import { configInputToDescriptor, toConfigInput } from "../../src/descriptor/resolve";
import { mergeBosConfigWithExtends } from "../../src/merge";
import { BosConfigSchema } from "../../src/types";

const configWithPins = {
  account: "v1.citynode.near",
  domain: "citynode.app",
  app: {
    host: {
      development: "local:host",
      production: "https://cdn/host/",
      pin: { manifest: "versions/aaa.json", integrity: "sha384-host-manifest-sri" },
    },
    ui: {
      development: "local:ui",
      production: "https://cdn/ui/",
      pin: { manifest: "versions/bbb.json", integrity: "sha384-manifest-sri" },
      ssr: "https://cdn/ui/ssr/",
      ssrIntegrity: "sha384-ssr-sri",
    },
    api: {
      development: "local:api",
      production: "https://cdn/api/",
      pin: { manifest: "versions/ccc.json", integrity: "sha384-api-manifest-sri" },
    },
  },
  plugins: {
    auth: {
      name: "@everything-dev/auth-plugin",
      development: "local:plugins/auth",
      production: "https://cdn/auth/",
      pin: { manifest: "versions/ddd.json", integrity: "sha384-auth-manifest-sri" },
      ui: {
        name: "auth-ui",
        development: "local:plugins/auth/ui",
        production: "https://cdn/auth-ui/",
        pin: { manifest: "versions/eee.json", integrity: "sha384-auth-ui-manifest-sri" },
      },
    },
  },
};

describe("config slot `pin`", () => {
  it("survives BosConfigSchema.parse on every slot kind", () => {
    const parsed = BosConfigSchema.parse(configWithPins);
    expect(parsed.app.ui.pin?.manifest).toBe("versions/bbb.json");
    expect(parsed.app.host.pin?.manifest).toBe("versions/aaa.json");
    expect(parsed.app.api.pin?.manifest).toBe("versions/ccc.json");
    expect(parsed.plugins?.auth?.pin?.manifest).toBe("versions/ddd.json");
    expect(parsed.plugins?.auth?.ui?.pin?.manifest).toBe("versions/eee.json");
  });

  it("keeps a slot without a pin valid (direct entry SRI)", () => {
    const parsed = BosConfigSchema.parse({
      account: "a",
      app: {
        host: { development: "local:host", production: "https://cdn/host/" },
        ui: { development: "local:ui", production: "https://cdn/ui/" },
        api: { development: "local:api", production: "https://cdn/api/" },
      },
    });
    expect(parsed.app.ui.pin).toBeUndefined();
  });

  it("survives the descriptor roundtrip (ui slots carry it like integrity)", () => {
    const descriptor = configInputToDescriptor(configWithPins);
    const authored = toConfigInput(descriptor as never) as typeof configWithPins;
    expect(authored.plugins?.auth?.ui?.pin).toEqual({
      manifest: "versions/eee.json",
      integrity: "sha384-auth-ui-manifest-sri",
    });
  });

  it("extends merge: the pin is atomic — child pin replaces the parent's whole, child without pin inherits", () => {
    const parent = {
      account: "dev.everything.near",
      domain: "everything.dev",
      app: {
        ui: {
          development: "local:ui",
          production: "https://cdn.everything.dev/ui/",
          pin: { manifest: "versions/parent-ui.json", integrity: "sha384-parent-pin" },
        },
      },
    };
    const childOverride = {
      account: "v1.citynode.near",
      domain: "citynode.app",
      app: {
        ui: {
          development: "local:ui",
          pin: { manifest: "versions/child-ui.json", integrity: "sha384-child-pin" },
        },
      },
    };
    const childInherit = {
      account: "v1.citynode.near",
      domain: "citynode.app",
      app: { ui: { development: "local:ui" } },
    };
    // child pin replaces the parent's ATOMICALLY — no half-mixed manifest/integrity
    expect(mergeBosConfigWithExtends(parent, childOverride).app?.ui?.pin).toEqual({
      manifest: "versions/child-ui.json",
      integrity: "sha384-child-pin",
    });
    expect(mergeBosConfigWithExtends(parent, childInherit).app?.ui?.pin).toEqual({
      manifest: "versions/parent-ui.json",
      integrity: "sha384-parent-pin",
    });
  });

  it("extends merge: child plugin entries replace parent entries wholesale (no field-level fill)", () => {
    const parent = {
      account: "dev.everything.near",
      plugins: {
        auth: {
          name: "@everything-dev/auth-plugin",
          pin: { manifest: "versions/parent-auth.json", integrity: "sha384-parent-auth" },
        },
        apps: { name: "apps", pin: { manifest: "versions/parent-apps.json", integrity: "x" } },
      },
    };
    const child = {
      account: "v1.citynode.near",
      plugins: {
        auth: { extends: "auth", production: "https://cdn.everything.dev/auth/" },
      },
    };
    const merged = mergeBosConfigWithExtends(parent, child);
    expect(merged.plugins?.auth?.pin).toBeUndefined();
    expect(merged.plugins?.apps).toBeUndefined();
  });
});
