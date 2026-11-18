import type { Page } from "@playwright/test";
import type { DemoPersona } from "../../fixtures/demo/demo-data.ts";
import { type DemoSeed, seedDemo } from "../../lib/demo-seed.ts";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { injectSessionCookies } from "./seeded";

export type { DemoPersona, DemoSeed };

export async function seedDemoCommunities(): Promise<DemoSeed> {
  const { dbUrls, authSecret, baseUrl } = computeRegressionEnv();
  if (!dbUrls.API_DATABASE_URL || !dbUrls.AUTH_DATABASE_URL) {
    throw new Error("API_DATABASE_URL and AUTH_DATABASE_URL are required to seed demo communities");
  }
  return seedDemo({
    databaseUrls: {
      api: dbUrls.API_DATABASE_URL,
      auth: dbUrls.AUTH_DATABASE_URL,
      proposals: dbUrls.PROPOSALS_DATABASE_URL,
    },
    secret: authSecret,
    baseUrl,
  });
}

export async function signInAsDemo(page: Page, seed: DemoSeed, persona: DemoPersona) {
  await injectSessionCookies(page, seed.personas[persona].cookies);
}
