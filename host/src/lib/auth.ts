import type {
  AuthPluginContext,
  AuthRequestContext,
  AuthSession,
  AuthSessionData,
  AuthSessionUser,
<<<<<<< HEAD
=======
  AuthServices as GeneratedAuthServices,
>>>>>>> 59480b4 (refactor: derive auth context types from generated auth contract)
} from "@/lib/auth-types.gen";

export type {
  AuthPluginContext,
  AuthRequestContext,
  AuthSession,
  AuthSessionData,
  AuthSessionUser,
};
export type AuthUser = AuthSessionUser;

<<<<<<< HEAD
export type { AuthServices } from "@/lib/auth-types.gen";
=======
interface AuthServices extends GeneratedAuthServices {
  auth: GeneratedAuthServices["auth"];
}
>>>>>>> 59480b4 (refactor: derive auth context types from generated auth contract)

export interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  getContext(): Promise<AuthRequestContext>;
}

export interface AuthVariables {
  authContext: AuthRequestContext | null;
  user: AuthUser | null;
  session: AuthSessionData | null;
  reqHeaders: Headers;
  getRawBody: () => Promise<string>;
}
<<<<<<< HEAD
=======

export type HonoEnv = { Variables: AuthVariables };

export function toAuthClientContext(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

export type { AuthServices };
>>>>>>> 59480b4 (refactor: derive auth context types from generated auth contract)
