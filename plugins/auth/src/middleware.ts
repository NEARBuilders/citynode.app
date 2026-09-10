import { ORPCError } from "every-plugin/orpc";
import type { PluginServices } from "./service-types";
import { createHeaders } from "./utils";

export function createRequireAuth(builder: any, services: PluginServices) {
  return builder.middleware(async ({ context, next }: { context: any; next: any }) => {
    let user = context.user?.id ? context.user : null;
    if (!user) {
      const headers = createHeaders(context.reqHeaders);
      const session = await services.auth.api.getSession({ headers });
      user = session?.user ?? null;
    }

    if (!user?.id) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Authentication required",
      });
    }

    return next({
      context: {
        userId: user.id,
        user,
        reqHeaders: context.reqHeaders,
      },
    });
  });
}
