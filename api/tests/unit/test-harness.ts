import { Cause, Data, Effect, Exit, type Layer } from "effect";

class TestRunError extends Data.TaggedError("TestRunError")<{ cause: unknown }> {}

export interface ServiceHarness<Svc, LayerError, ServiceError> {
  run<A>(
    layer: Layer.Layer<any, LayerError, never>,
    fn: (svc: Svc) => Promise<A> | Effect.Effect<A, ServiceError, never>,
  ): Promise<A>;
  squashError<A>(
    layer: Layer.Layer<any, LayerError, never>,
    fn: (svc: Svc) => Promise<A> | Effect.Effect<A, ServiceError, never>,
  ): Promise<unknown>;
}

export function createServiceHarness<Svc, Tags, LayerError, ServiceError>(
  servicesOf: Effect.Effect<Svc, never, Tags>,
): ServiceHarness<Svc, LayerError, ServiceError> {
  const compose = (
    layer: Layer.Layer<Tags, LayerError, never>,
    fn: (svc: Svc) => Promise<unknown> | Effect.Effect<unknown, ServiceError | TestRunError, never>,
  ) =>
    Effect.gen(function* () {
      const svc = yield* servicesOf;
      return yield* Effect.suspend(() => {
        const result = fn(svc);
        return Effect.isEffect(result)
          ? result
          : Effect.tryPromise({
              try: () => result,
              catch: (error) => new TestRunError({ cause: error }),
            });
      });
    }).pipe(Effect.provide(layer));

  return {
    run: async <A>(
      layer: Layer.Layer<Tags, LayerError, never>,
      fn: (svc: Svc) => Promise<A> | Effect.Effect<A, ServiceError, never>,
    ) => (await Effect.runPromise(compose(layer, fn))) as A,
    squashError: async (layer, fn) => {
      const exit = await Effect.runPromiseExit(compose(layer, fn));
      if (Exit.isSuccess(exit)) {
        throw new Error("Expected effect to fail");
      }
      const squashed = Cause.squash(exit.cause);
      return squashed instanceof TestRunError ? squashed.cause : squashed;
    },
  };
}
