/**
 * Better-Auth client surface for this app — re-exports the framework auth
 * client factory (plugin inference is preserved there; no app-specific
 * additional fields exist to bind).
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

export type {
  AuthClient,
  CreateAuthClientOptions,
  Organization,
  Passkey,
  SessionData,
} from "everything-dev/ui/auth";

export {
  createAuthClient,
  sessionQueryKey,
  sessionQueryOptions,
  useAuthClient,
  useRelayHistory,
} from "everything-dev/ui/auth";
export type * from "./auth-types.gen";
