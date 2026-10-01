import { describe, expect, it } from "vitest";
import { configInputToDescriptor, toConfigInput } from "../../src/descriptor/resolve";
import { BosConfigSchema } from "../../src/types";

const configWithManifest = {
  account: "v1.citynode.near",
  domain: "citynode.app",
  app: {
    host: {
      development: "local:host",
      production: "https://cdn/host/",
      manifest: "versions/aaa.json",
    },
    ui: {
      development: "local:ui",
      production: "https://cdn/ui/",
      manifest: "versions/bbb.json",
      integrity: "sha384-manifest-sri",
      ssr: "https://cdn/ui/ssr/",
      ssrIntegrity: "sha384-ssr-sri",
    },
    api: {
      development: "local:api",
      production: "https://cdn/api/",
      manifest: "versions/ccc.json",
    },
  },
  plugins: {
    auth: {
      name: "@everything-dev/auth-plugin",
      development: "local:plugins/auth",
      production: "https://cdn/auth/",
      manifest: "versions/ddd.json",
      integrity: "sha384-auth-manifest-sri",
      ui: {
        name: "auth-ui",
        development: "local:plugins/auth/ui",
        production: "https://cdn/auth-ui/",
        manifest: "versions/eee.json",
        integrity: "sha384-auth-ui-manifest-sri",
      },
    },
  },
};

describe("config slot `manifest` pointer", () => {
  it("survives BosConfigSchema.parse on every slot kind", () => {
    const parsed = BosConfigSchema.parse(configWithManifest);
    expect(parsed.app.ui.manifest).toBe("versions/bbb.json");
    expect(parsed.app.host.manifest).toBe("versions/aaa.json");
    expect(parsed.app.api.manifest).toBe("versions/ccc.json");
    expect(parsed.plugins?.auth?.manifest).toBe("versions/ddd.json");
    expect(parsed.plugins?.auth?.ui?.manifest).toBe("versions/eee.json");
  });

  it("keeps a slot without manifest valid (back-compat)", () => {
    const parsed = BosConfigSchema.parse({
      account: "a",
      app: {
        host: { development: "local:host", production: "https://cdn/host/" },
        ui: { development: "local:ui", production: "https://cdn/ui/" },
        api: { development: "local:api", production: "https://cdn/api/" },
      },
    });
    expect(parsed.app.ui.manifest).toBeUndefined();
  });

  it("survives the descriptor roundtrip (ui slots carry it like integrity)", () => {
    const descriptor = configInputToDescriptor(configWithManifest);
    const authored = toConfigInput(descriptor as never) as typeof configWithManifest;
    expect(authored.plugins?.auth?.ui?.manifest).toBe("versions/eee.json");
    expect(authored.plugins?.auth?.ui?.integrity).toBe("sha384-auth-ui-manifest-sri");
  });
});
