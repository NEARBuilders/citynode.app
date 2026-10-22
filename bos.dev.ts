import type { AppDescriptor } from "everything-dev/descriptor";

/**
 * Dev overlay for the everything.dev runtime (bos.app.ts) — merged
 * child-wins over the resolved config when the environment is development.
 * Never published. Overrides live here, commented in/out per developer —
 * `bos dev`/typecheck resolution honors this file (development only).
 *
 * Example: pin the auth attachment to a running dev server instead of
 * letting the dev harness spawn it (uncomment when auth is up on :3006):
 *
 * export default {
 *   auth: { development: "http://localhost:3006" },
 * } satisfies Partial<AppDescriptor>;
 *
 * The auth SERVER composes the published upstream bundle in development too —
 * the parent's inherited `development: "local:plugins/auth"` target is the
 * parent's own workspace path and cannot spawn here. The auth-UI stays local
 * (authored in bos.app.ts); no dev override is needed for it.
 */
export default {
  auth: {
    development: "https://cdn.everything.dev/bundles/dev.everything.near/everything.dev/auth/",
  },
} satisfies Partial<AppDescriptor>;
