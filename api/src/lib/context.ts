import { Cause, Effect, Exit } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const ContextSchema = z.object({
  userId: z.string().optional(),
  user: z
    .object({
      id: z.string(),
      role: z.string().optional(),
      email: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  organizationId: z.string().optional(),
  organization: z
    .object({
      activeOrganizationId: z.string().nullable().optional(),
      organization: z
        .object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
          logo: z.string().nullable().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .nullable()
        .optional(),
      member: z
        .object({
          id: z.string(),
          role: z.string(),
        })
        .nullable()
        .optional(),
      isPersonal: z.boolean(),
      hasOrganization: z.boolean(),
    })
    .optional(),
  near: z
    .object({
      primaryAccountId: z.string().nullable(),
      linkedAccounts: z.array(
        z.object({
          accountId: z.string(),
          network: z.string(),
          publicKey: z.string(),
          isPrimary: z.boolean(),
        }),
      ),
      hasNearAccount: z.boolean(),
    })
    .optional(),
  apiKey: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      permissions: z.record(z.string(), z.array(z.string())).nullable(),
    })
    .optional(),
  reqHeaders: z.custom<Headers>().optional(),
  getRawBody: z.custom<() => Promise<string>>().optional(),
});

export type Context = z.infer<typeof ContextSchema>;

export function pluginContext(context: Context) {
  return {
    userId: context.userId,
    user: context.user,
    organizationId: context.organizationId,
    organization: context.organization,
    near: context.near,
    apiKey: context.apiKey,
    reqHeaders: context.reqHeaders,
    getRawBody: context.getRawBody,
  };
}

export async function runEffect<A>(effect: Effect.Effect<A, unknown>) {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isFailure(exit)) {
    const squashed = Cause.squash(exit.cause);
    if (squashed instanceof ORPCError) {
      throw squashed;
    }

    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: squashed instanceof Error ? squashed.message : String(squashed),
    });
  }

  return exit.value;
}
