import { randomBytes } from "node:crypto";
import type { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import { onboardingLinks } from "../db/schema";
import { isUniqueViolation, toOrpcError } from "../lib/errors";

const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const SLUG_LENGTH = 8;
const SLUG_ATTEMPTS = 5;

export type OnboardingLinkEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export type OnboardingLinkRecord = typeof onboardingLinks.$inferSelect;

export interface NewOnboardingLink {
  organizationId: string;
  name: string;
  destination: string;
  createdByUserId: string;
}

export interface OnboardingLinkPatch {
  name?: string;
  destination?: string;
  enabled?: boolean;
}

export interface OnboardingLinksService {
  list(organizationId: string): OnboardingLinkEffect<OnboardingLinkRecord[]>;
  get(id: string): OnboardingLinkEffect<OnboardingLinkRecord | null>;
  create(link: NewOnboardingLink): OnboardingLinkEffect<OnboardingLinkRecord>;
  update(id: string, patch: OnboardingLinkPatch): OnboardingLinkEffect<OnboardingLinkRecord | null>;
  recordVisit(slug: string): OnboardingLinkEffect<string | null>;
}

export class OnboardingLinksTag extends Context.Service<
  OnboardingLinksTag,
  OnboardingLinksService
>()("api/OnboardingLinks") {}

export function newOnboardingLinkSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  return Array.from(bytes, (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length]).join("");
}

export const OnboardingLinksLive = Layer.effect(
  OnboardingLinksTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const query = <T>(run: () => Promise<T>): OnboardingLinkEffect<T> =>
      Effect.tryPromise({ try: run, catch: toOrpcError });

    const insert = async (link: NewOnboardingLink) => {
      for (let attempt = 1; ; attempt++) {
        try {
          const [row] = await db
            .insert(onboardingLinks)
            .values({ ...link, slug: newOnboardingLinkSlug() })
            .returning();
          return row!;
        } catch (error) {
          if (!isUniqueViolation(error) || attempt >= SLUG_ATTEMPTS) throw error;
        }
      }
    };

    return {
      list: (organizationId) =>
        query(() =>
          db
            .select()
            .from(onboardingLinks)
            .where(eq(onboardingLinks.organizationId, organizationId))
            .orderBy(desc(onboardingLinks.createdAt)),
        ),

      get: (id) =>
        query(async () => {
          const [row] = await db.select().from(onboardingLinks).where(eq(onboardingLinks.id, id));
          return row ?? null;
        }),

      create: (link) => query(() => insert(link)),

      update: (id, patch) =>
        query(async () => {
          const [row] = await db
            .update(onboardingLinks)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(onboardingLinks.id, id))
            .returning();
          return row ?? null;
        }),

      recordVisit: (slug) =>
        query(async () => {
          const [row] = await db
            .update(onboardingLinks)
            .set({
              visitCount: sql`${onboardingLinks.visitCount} + 1`,
              lastVisitedAt: new Date(),
            })
            .where(and(eq(onboardingLinks.slug, slug), eq(onboardingLinks.enabled, true)))
            .returning({ destination: onboardingLinks.destination });
          return row?.destination ?? null;
        }),
    };
  }),
);
