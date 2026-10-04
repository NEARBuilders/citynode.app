import { Data, DateTime, Effect } from "effect";
import type { z } from "zod";
// Import types from contract
import type { ItemSchema, SearchResultSchema } from "./contract";

// Infer the types from the schemas
type Item = z.infer<typeof ItemSchema>;
type SearchResult = z.infer<typeof SearchResultSchema>;

export class TemplateServiceError extends Data.TaggedError("TemplateServiceError")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {
  override get message() {
    return this.detail;
  }
}

/**
 * Template Service - Wraps external API calls with Effect-based error handling.
 */
export class TemplateService {
  constructor(
    readonly baseUrl: string,
    readonly _apiKey: string,
    readonly timeout: number,
  ) {}

  getById(id: string) {
    const { baseUrl, timeout } = this;
    return Effect.gen(function* () {
      yield* Effect.logInfo(`[TemplateService] Fetching from ${baseUrl} with timeout ${timeout}ms`);
      const createdAt = DateTime.formatIso(yield* DateTime.now);

      return yield* Effect.tryPromise({
        try: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));

          if (id === "not-found") {
            throw new TemplateServiceError({ detail: "Item not found" });
          }

          return {
            id,
            title: `Item ${id}`,
            createdAt,
          } satisfies Item;
        },
        catch: (cause) =>
          new TemplateServiceError({
            detail: `Failed to fetch item: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
      });
    });
  }

  search(query: string, limit: number): AsyncGenerator<SearchResult> {
    return (async function* () {
      for (let i = 0; i < limit; i++) {
        yield {
          item: {
            id: `${query}-${i}`,
            title: `${query} result ${i + 1}`,
            createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          },
          score: Math.max(0.1, 1 - i * 0.1),
        };
      }
    })();
  }

  readonly ping = Effect.gen(function* () {
    yield* Effect.sleep("10 millis");
    return {
      status: "ok" as const,
      timestamp: DateTime.formatIso(yield* DateTime.now),
    };
  });
}
