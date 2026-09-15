import { ORPCError } from "@orpc/server";
import { Cause, Effect, Exit } from "effect";

export function flattenError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.message];
    let cause: unknown = error.cause;
    while (cause instanceof Error) {
      parts.push(cause.message);
      cause = cause.cause;
    }
    return parts.join(": ");
  }
  return String(error);
}

/**
 * Runs an Effect and bridges failures into the oRPC error surface:
 * ORPCError failures rethrow as-is, everything else becomes an
 * INTERNAL_SERVER_ERROR ORPCError with a flattened message.
 */
export async function runEffect<A, E>(effect: Effect.Effect<A, E>) {
  const exit = await Effect.runPromiseExit(effect as Effect.Effect<A, unknown>);
  if (Exit.isFailure(exit)) {
    const squashed = Cause.squash(exit.cause);
    if (squashed instanceof ORPCError) {
      throw squashed;
    }

    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: flattenError(squashed),
    });
  }

  return exit.value;
}
