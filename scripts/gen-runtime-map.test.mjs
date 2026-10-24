import assert from "node:assert/strict";
import { test } from "node:test";
import { composeRuntimeMap } from "./gen-runtime-map.mjs";

const route = (id, path, extra = {}) => ({ id, type: "route", path, ...extra });
const layout = (id, extra = {}) => ({ id, type: "layout", ...extra });

const core = {
  key: "ui",
  manifest: {
    name: "ui",
    manifestVersion: 2,
    routes: [
      layout("_public", { mount: "public" }),
      layout("_authenticated", { mount: "authenticated" }),
      route("_public/about", "/about", { parentId: "_public" }),
      route("_public/login", "/login", { parentId: "_public" }),
    ],
  },
};

const auth = {
  key: "auth",
  manifest: {
    name: "auth",
    manifestVersion: 2,
    routes: [
      route("_public/login", "/login"),
      route("_public/onboard", "/onboard"),
      route("_authenticated/settings", "/settings"),
      route("_authenticated/settings/profile", "/profile", {
        parentId: "_authenticated/settings",
      }),
    ],
  },
};

test("resolves full paths across mounts and nested parentIds", () => {
  const map = composeRuntimeMap([core, auth]);
  const byId = Object.fromEntries(map.routes.map((r) => [`${r.owner}:${r.id}`, r]));

  assert.equal(byId["ui:_public/about"].fullPath, "/about");
  assert.equal(byId["auth:_public/onboard"].fullPath, "/onboard");
  assert.equal(byId["auth:_authenticated/settings"].fullPath, "/settings");
  assert.equal(byId["auth:_authenticated/settings/profile"].fullPath, "/settings/profile");
  assert.equal(byId["auth:_authenticated/settings"].mount, "authenticated");
  assert.equal(byId["ui:_public/about"].core, true);
  assert.equal(byId["auth:_public/onboard"].core, false);
});

test("core ui wins a route claim and the plugin route is shadowed", () => {
  const map = composeRuntimeMap([core, auth]);
  const logins = map.routes.filter((r) => r.fullPath === "/login");

  assert.equal(logins.length, 1);
  assert.equal(logins[0].owner, "ui");
  assert.ok(
    map.shadowed.some((s) => s.owner === "auth" && s.id === "_public/login" && s.kind === "route"),
  );
});

test("plugin-vs-plugin collisions throw", () => {
  const peer = {
    key: "zz-peer",
    manifest: {
      name: "zz-peer",
      manifestVersion: 2,
      routes: [route("_public/onboard", "/onboard")],
    },
  };

  assert.throws(() => composeRuntimeMap([core, auth, peer]), /path collision/);
});

test("mount aliases resolve to canonical mounts", () => {
  const legacy = {
    key: "legacy",
    manifest: {
      name: "legacy",
      manifestVersion: 2,
      routes: [route("_auth/legacy", "/legacy")],
    },
  };

  const map = composeRuntimeMap([core, legacy]);
  const entry = map.routes.find((r) => r.owner === "legacy");
  assert.equal(entry.mount, "authenticated");
  assert.equal(entry.fullPath, "/legacy");
});

test("a route outside any mount is rejected", () => {
  const stray = {
    key: "stray",
    manifest: { name: "stray", manifestVersion: 2, routes: [route("loose", "/loose")] },
  };

  assert.throws(() => composeRuntimeMap([core, stray]), /must live under a mount/);
});
