import { App, Plugin } from "@manifest-compose/shared";

/**
 * Minimal shape-of-028 descriptor (ADR 0005 slice) — pure data driving the
 * prototype host's composition resolver. The tenant app stands in for the
 * extends relationship: same auth plugin, landing swapped.
 */
export const baseApp = App({
  name: "base",
  plugins: {
    auth: Plugin("auth").local("./remote-auth"),
    landing: Plugin("landing").local("./remote-landing"),
  },
});

export const tenantApp = App({
  name: "tenant",
  extends: "base",
  plugins: {
    auth: Plugin("auth").local("./remote-auth"),
    landing: Plugin("landing").local("./remote-landing-tenant"),
  },
});

export const APPS = { base: baseApp, tenant: tenantApp };
export type AppKey = keyof typeof APPS;
