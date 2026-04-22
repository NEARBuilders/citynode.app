import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema/auth";
import type { Auth } from "./auth";
import type { Database } from "./database";

type SessionResult = Awaited<ReturnType<Auth["api"]["getSession"]>>;
type User = NonNullable<SessionResult>["user"];

// Linked NEAR account info
export interface NearIdentity {
  accountId: string;
  network: string;
  publicKey: string;
  isPrimary: boolean;
}

// User can have multiple linked NEAR accounts
export interface NearCapabilities {
  primaryAccountId: string | null;
  linkedAccounts: NearIdentity[];
  hasNearAccount: boolean;
}

// Organization member info
export interface OrganizationMember {
  id: string;
  role: string;
}

// Organization info
export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown>;
}

// Organization context
export interface OrganizationContext {
  activeOrganizationId: string | null;
  organization: OrganizationInfo | null;
  member: OrganizationMember | null;
  isPersonal: boolean;
  hasOrganization: boolean;
}

// Unified request context
export interface RequestContext {
  // Core identity
  user: User | null;
  userId: string | null;
  isAuthenticated: boolean;

  // Auth method used
  authMethod: "session" | "apiKey" | "anonymous" | "none";

  // Public identity (NEAR) - user selects which is active
  near: NearCapabilities;

  // Workspace context
  organization: OrganizationContext;

  // Raw request data
  reqHeaders: Headers;
  getRawBody?: () => Promise<string>;

  // SSR compatibility - session from Better Auth
  session: SessionResult;

  // Server-side capabilities
  auth: Auth;
  db: Database;
}

export async function createRequestContext(
  req: Request,
  auth: Auth,
  db: Database,
): Promise<RequestContext> {
  // Get session from Better Auth
  const session = await auth.api.getSession({ headers: req.headers });
  const user = session?.user ?? null;

  // Check if authenticated
  const isAuthenticated = !!user;
  const authMethod: RequestContext["authMethod"] = isAuthenticated ? "session" : "none";

  // Load all linked NEAR accounts for this user
  let nearCapabilities: NearCapabilities = {
    primaryAccountId: null,
    linkedAccounts: [],
    hasNearAccount: false,
  };

  if (user?.id) {
    const nearAccounts = await db.query.nearAccount.findMany({
      where: eq(schema.nearAccount.userId, user.id),
    });

    if (nearAccounts.length > 0) {
      const linkedAccounts = nearAccounts.map((acc) => ({
        accountId: acc.accountId,
        network: acc.network,
        publicKey: acc.publicKey,
        isPrimary: acc.isPrimary ?? false,
      }));

      const primary = nearAccounts.find((acc) => acc.isPrimary) || nearAccounts[0];

      nearCapabilities = {
        primaryAccountId: primary.accountId,
        linkedAccounts,
        hasNearAccount: true,
      };
    }
  }

  // Load organization context from session
  let organizationContext: OrganizationContext = {
    activeOrganizationId: null,
    organization: null,
    member: null,
    isPersonal: false,
    hasOrganization: false,
  };

  if (user?.id) {
    const activeOrgId = session?.session?.activeOrganizationId;

    if (activeOrgId) {
      // Load the organization
      const org = await db.query.organization.findFirst({
        where: eq(schema.organization.id, activeOrgId),
      });

      if (org) {
        // Load membership
        const membership = await db.query.member.findFirst({
          where: and(
            eq(schema.member.userId, user.id),
            eq(schema.member.organizationId, activeOrgId),
          ),
        });

        if (membership) {
          organizationContext = {
            activeOrganizationId: activeOrgId,
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              logo: org.logo,
              metadata: org.metadata ? JSON.parse(org.metadata) : undefined,
            },
            member: {
              id: membership.id,
              role: membership.role,
            },
            isPersonal: org.slug === user.id, // Personal org has slug = user id
            hasOrganization: true,
          };
        }
      }
    }
  }

  return {
    user,
    userId: user?.id ?? null,
    isAuthenticated,
    authMethod,
    near: nearCapabilities,
    organization: organizationContext,
    reqHeaders: req.headers,
    session,
    auth,
    db,
  };
}

// Helper to set active NEAR account
export function setActiveNearAccount(context: RequestContext, accountId: string): RequestContext {
  const account = context.near.linkedAccounts.find((acc) => acc.accountId === accountId);

  if (!account) {
    throw new Error(`NEAR account ${accountId} not linked to user`);
  }

  return {
    ...context,
    near: {
      ...context.near,
      primaryAccountId: accountId,
    },
  };
}

// Helper to check if user has permission in current organization
export function hasOrganizationPermission(context: RequestContext, requiredRole: string): boolean {
  if (!context.organization.hasOrganization || !context.organization.member) {
    return false;
  }

  const userRole = context.organization.member.role;

  // Role hierarchy
  const roleHierarchy: Record<string, number> = {
    owner: 100,
    admin: 80,
    member: 50,
    guest: 20,
  };

  const userRoleLevel = roleHierarchy[userRole] ?? 0;
  const requiredRoleLevel = roleHierarchy[requiredRole] ?? 0;

  return userRoleLevel >= requiredRoleLevel;
}
