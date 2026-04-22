import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import type { Auth } from "host/src/services/auth";
import { contract } from "./contract";
import { OpencodeService } from "./service";

interface AuthContext {
  userId: string;
  user: {
    id: string;
    role?: string;
    email?: string;
    name?: string;
  };
  reqHeaders?: Headers;
  auth: Auth;
}

export default createPlugin({
  variables: z.object({
    opencodePort: z.number().min(1).max(65535).default(4096),
    opencodeHost: z.string().default("localhost"),
  }),

  secrets: z.object({
    OPENCODE_API_KEY: z.string().optional(),
  }),

  context: z.object({
    userId: z.string().optional(),
    user: z
      .object({
        id: z.string(),
        role: z.string().optional(),
        email: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
    reqHeaders: z.custom<Headers>().optional(),
    auth: z.custom<Auth>().optional(),
  }),

  contract,

  initialize: (config) =>
    Effect.sync(() => {
      const service = new OpencodeService(
        config.variables.opencodeHost,
        config.variables.opencodePort,
        config.secrets.OPENCODE_API_KEY,
      );

      console.log(
        `[Opencode] Plugin initialized (host=${config.variables.opencodeHost}, port=${config.variables.opencodePort})`,
      );
      return { service };
    }),

  shutdown: () => Effect.log("[Opencode] Shutdown"),

  createRouter: (context, builder) => {
    const { service } = context;

    const requireAdmin = builder.middleware(async ({ context, next }) => {
      if (!context.userId || !context.user) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
          data: { authType: "session", hint: "Sign in to access opencode features" },
        });
      }

      if (context.user.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Admin access required",
          data: {
            role: context.user.role,
            hint: "Only users with admin role can access opencode features",
          },
        });
      }

      return next({
        context: {
          userId: context.userId,
          user: context.user,
          reqHeaders: context.reqHeaders,
          auth: context.auth!,
        } as AuthContext,
      });
    });

    return {
      serverStatus: builder.serverStatus.use(requireAdmin).handler(async () => {
        const data = await service.getServerStatus();
        return { data };
      }),

      startServer: builder.startServer.use(requireAdmin).handler(async () => {
        const data = await service.startServer();
        return { data };
      }),

      createSession: builder.createSession.use(requireAdmin).handler(async ({ input }) => {
        const data = await service.createSession(input.title);
        return { data };
      }),

      sendPrompt: builder.sendPrompt.use(requireAdmin).handler(async ({ input, errors }) => {
        const result = await service.sendPrompt(input.sessionId, input.message);
        if (result.status === "error") {
          throw errors.NOT_FOUND({
            message: `Session ${input.sessionId} not found or opencode server unreachable`,
            data: { resource: "session", resourceId: input.sessionId },
          });
        }
        return { data: result };
      }),

      events: builder.events.use(requireAdmin).handler(async function* ({ input, signal }) {
        const iterator = service.streamEvents(input.sessionId, input.lastEventId, signal);
        for await (const event of iterator) {
          yield event;
        }
      }),
    };
  },
});
