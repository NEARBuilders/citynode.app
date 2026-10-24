import type { AppDescriptor } from "everything-dev/descriptor";

/**
 * Dev overlay for the everything.dev runtime (bos.app.ts) — merged
 * child-wins over the resolved config when the environment is development.
 * Never published. Overrides live here, commented in/out per developer —
 * `bos dev`/typecheck resolution honors this file (development only).
 *
 * Auth is the published @everything-dev/auth-plugin (server + UI) inherited
 * from the extends chain; no citynode-specific dev override is needed.
 */
export default {} satisfies Partial<AppDescriptor>;
