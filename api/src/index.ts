import type { ContractedRouter } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { Cause, Context, DateTime, Effect, Exit, Layer } from "effect";
import { buildScopedContext, createPlugin } from "every-plugin";
import { createAuthMiddleware } from "everything-dev/api";
import { suppressPgQueryQueueDeprecation } from "everything-dev/db";
import { z } from "zod";
import { contract, type EventOnboardingCodeSchema } from "./contract";
import { DatabaseLive } from "./db/layer";
import { activateCommunity } from "./lib/activate-community";
import type { AuthPluginContext as AuthContext } from "./lib/auth-types.gen";
import { ContextSchema } from "./lib/context";
import {
  grantApplicantAdmin,
  linkOfficialDao,
  officialDaoOf,
  parseOfficialApplication,
  resolveApplicationCommunity,
} from "./lib/official-application";
import { createPlatformOrganization, isPlatformOrganization } from "./lib/platform-stations";
import type { PluginsClient } from "./lib/plugins-types.gen";
import { reportMonthWindow } from "./report-month";
import { AttendanceLive, type AttendanceService, AttendanceTag } from "./services/attendance";
import { verifyDaoMembership } from "./services/dao";
import type { DiscoveryService, MonthlyExternalStats } from "./services/discovery";
import { DiscoveryLive, DiscoveryTag } from "./services/discovery";
import {
  MemberDirectoryLive,
  type MemberDirectoryService,
  MemberDirectoryTag,
} from "./services/member-directory";
import { communityPath, createNearbuilders } from "./services/nearbuilders";
import type { BulletinPublisher, NodeEffect, NodeRecord, NodesService } from "./services/nodes";
import { NodesLive, NodesTag, nodeKindOf, PLATFORM_NODE_KIND } from "./services/nodes";
import type { PlacesService } from "./services/places";
import { PlacesLive, PlacesTag } from "./services/places";
import {
  makeStakingPools,
  StakingPoolCheckFailed,
  type StakingPoolsService,
} from "./services/staking-pools";
import {
  buildBundleKey,
  bundleCacheControl,
  bundleContentType,
  computeObjectIntegrity,
  maxBundleUploadBytes,
  measureBase64,
  partitionBundleFiles,
  StorageLive,
  type StorageService,
  StorageTag,
  validateNamespacePart,
  validateObjectPath,
  validateUploadSize,
} from "./services/storage";
import {
  type TeamJoinRequestRecord,
  TeamJoinRequestsLive,
  type TeamJoinRequestsService,
  TeamJoinRequestsTag,
} from "./services/team-join-requests";
import type { TenantRecord, TenantsService } from "./services/tenants";
import { TenantsConfigLive, TenantsLive, TenantsTag } from "./services/tenants";
import type { ValidatorsService } from "./services/validators";
import { ValidatorsLive, ValidatorsTag } from "./services/validators";
import {
  canUseTeamArea,
  createRequireTeamArea,
  type TeamAccessContext,
  teamAreaForbidden,
} from "./team-access-policy";
import {
  closureReason,
  isJoinableTeam,
  memberDisplayName,
  recognizedAreas,
  type UpstreamTeam,
} from "./team-join-policy";

export class ApiServices extends Context.Service<
  ApiServices,
  {
    tenants: TenantsService;
    nodes: NodesService;
    places: PlacesService;
    validators: ValidatorsService;
    discovery: DiscoveryService;
    storage: StorageService;
    nearbuilders: ReturnType<typeof createNearbuilders>;
    memberDirectory: MemberDirectoryService;
    attendance: AttendanceService;
    teamJoinRequests: TeamJoinRequestsService;
    stakingPools: StakingPoolsService;
    platformStationsAccount: string | null;
  }
>()("api/ApiServices") {}

const ONBOARDING_GRACE_MS = 48 * 3_600_000;

const MEMBER_PAGE_SIZE = 100;
const ORGANIZATION_PAGE = 100;
const MEMBER_DIRECTORY_SCAN_PAGES = 10;

const ACCOUNT_ID_REGEX =
  /^(?=.{2,64}$)([a-z0-9]+(?:[-_][a-z0-9]+)*)(\.([a-z0-9]+(?:[-_][a-z0-9]+)*))*$/;

suppressPgQueryQueueDeprecation();

const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?=.{1,64}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$/;

const guardNodeKind = (
  current: string | null,
  next: string | null | undefined,
): NodeEffect<void> =>
  next == null || (next === PLATFORM_NODE_KIND) === (current === PLATFORM_NODE_KIND)
    ? Effect.void
    : Effect.fail(
        new ORPCError("BAD_REQUEST", {
          message: "The platform node kind is reserved for platform stations",
        }),
      );

const requestedNodeKind = (input: { kind?: string; metadata?: Record<string, unknown> }) =>
  input.kind ?? (input.metadata ? nodeKindOf(input.metadata) : undefined);

const validateAccountId = (accountId: string): NodeEffect<void> =>
  ACCOUNT_ID_REGEX.test(accountId)
    ? Effect.void
    : Effect.fail(
        new ORPCError("BAD_REQUEST", {
          message: "Invalid accountId format",
          data: { hint: "Must be a valid NEAR account ID" },
        }),
      );

const checkStakingPool = (
  stakingPools: StakingPoolsService,
  accountId: string,
  network: string,
): NodeEffect<boolean> =>
  validateAccountId(accountId).pipe(
    Effect.andThen(() =>
      stakingPools.isApproved(accountId, network).pipe(
        Effect.mapError((error) =>
          error instanceof StakingPoolCheckFailed
            ? new ORPCError("CONNECTION_ERROR", {
                message: `Could not check the staking pool whitelist on ${error.network}`,
                data: {
                  errorCode: "STAKING_POOL_CHECK_FAILED",
                  suggestion: "Try again in a moment",
                },
              })
            : new ORPCError("BAD_REQUEST", { message: error.message }),
        ),
      ),
    ),
  );

const requireApprovedStakingPool = (
  stakingPools: StakingPoolsService,
  validator: { accountId: string; network: string; protocol: string },
): NodeEffect<void> =>
  Effect.gen(function* () {
    if (validator.protocol.trim().toLowerCase() !== "near") return;
    const approved = yield* checkStakingPool(stakingPools, validator.accountId, validator.network);
    if (!approved) {
      return yield* Effect.fail(
        new ORPCError("BAD_REQUEST", {
          message: `${validator.accountId} is not an approved staking pool on ${validator.network}`,
          data: {
            invalidFields: ["accountId"],
            validationErrors: [
              {
                field: "accountId",
                message: "Not an approved staking pool",
                code: "STAKING_POOL_NOT_APPROVED",
              },
            ],
          },
        }),
      );
    }
  });

const validateHostname = (hostname: string): NodeEffect<void> => {
  const normalized = hostname.toLowerCase();
  return HOSTNAME_REGEX.test(normalized)
    ? Effect.void
    : Effect.fail(
        new ORPCError("BAD_REQUEST", {
          message: "Invalid hostname format",
          data: { hint: "Must be a valid DNS hostname" },
        }),
      );
};

function publishStatusFor(ownerAccountId: string): "pending_funding" | "ready" {
  return ownerAccountId.startsWith("0s") ? "pending_funding" : "ready";
}

type NodeAccessContext = NonNullable<TeamAccessContext> & {
  user?: { role?: string | null } | null;
  organization?:
    | (NonNullable<TeamAccessContext>["organization"] & {
        activeOrganizationId: string | null;
      })
    | null;
};

type ViewerContext = {
  userId?: string | null;
  user?: { id?: string; name?: string | null; isAnonymous?: boolean | null } | null;
};

const bulletinPublisherOf = (context: ViewerContext): BulletinPublisher => ({
  userId: context.userId ?? context.user?.id ?? null,
  name: memberDisplayName(context.user?.name),
});

const nodeForViewer = (context: ViewerContext) => {
  const signedIn = !!context.user && context.user.isAnonymous !== true;
  return (node: NodeRecord): NodeRecord =>
    signedIn ? node : { ...node, bulletinPublisherName: null };
};

const requireNodeOperationsAccess = (context: NodeAccessContext): NodeEffect<void> =>
  canUseTeamArea(context, "node-operations")
    ? Effect.void
    : Effect.fail(teamAreaForbidden(["node-operations"]));

const resolveNodeForAccess = (
  services: { nodes: NodesService },
  nodeId: string,
): NodeEffect<NodeRecord> =>
  Effect.gen(function* () {
    const node = yield* services.nodes.getById(nodeId);
    if (!node) {
      return yield* Effect.fail(
        new ORPCError("NOT_FOUND", {
          message: "Node not found",
          data: { resource: "node", resourceId: nodeId },
        }),
      );
    }
    return node;
  });

const authorizeNodeAccess = (
  services: { tenants: TenantsService },
  node: NodeRecord,
  context: NodeAccessContext,
  options: { adminBypassOrg: boolean; resource: "node" | "validators" },
): NodeEffect<void> =>
  Effect.gen(function* () {
    if (!node.tenantId) {
      if (context.user?.role === "admin") return;
      const officialOrgId =
        options.resource === "validators" && node.orgId && officialDaoOf(node) ? node.orgId : null;
      if (!officialOrgId || context.organization?.activeOrganizationId !== officialOrgId) {
        return yield* Effect.fail(
          new ORPCError("FORBIDDEN", {
            message:
              options.resource === "validators" && node.orgId
                ? "Validators can be attached once the community is official"
                : "Standalone nodes can only be managed by platform admins",
          }),
        );
      }
      yield* requireNodeOperationsAccess(context);
      return;
    }
    const tenant = yield* services.tenants.resolveTenantById(node.tenantId!);
    if (!tenant) {
      return yield* Effect.fail(
        new ORPCError("NOT_FOUND", {
          message: "Tenant not found",
          data: { resource: "node", resourceId: node.tenantId },
        }),
      );
    }
    const ownsOrg =
      !!context.organization?.activeOrganizationId &&
      tenant.orgId === context.organization.activeOrganizationId;
    if (options.adminBypassOrg ? context.user?.role !== "admin" && !ownsOrg : !ownsOrg) {
      return yield* Effect.fail(
        new ORPCError("FORBIDDEN", {
          message:
            options.resource === "validators"
              ? "This node's validators do not belong to your community"
              : "This node does not belong to your community",
        }),
      );
    }
    yield* requireNodeOperationsAccess(context);
  });

const isCommunitySettingsRole = (role: string | null | undefined): boolean =>
  role === "owner" || role === "admin";

const authorizedTenant = (
  services: { tenants: TenantsService },
  input: { tenantId: string },
  context: {
    user?: { id?: string; role?: string | null };
    organization?: { activeOrganizationId: string | null; member?: { role?: string } | null };
    near?: { primaryAccountId: string | null };
  },
): NodeEffect<TenantRecord> =>
  Effect.gen(function* () {
    const tenant = yield* services.tenants.resolveTenantById(input.tenantId);
    if (!tenant) {
      return yield* Effect.fail(
        new ORPCError("NOT_FOUND", {
          message: "Tenant not found",
          data: { resource: "tenant", resourceId: input.tenantId },
        }),
      );
    }
    if (context.user?.role === "admin") return tenant;
    if (tenant.ownerKind === "user") {
      if (!context.user?.id || tenant.ownerUserId !== context.user.id) {
        return yield* Effect.fail(
          new ORPCError("FORBIDDEN", {
            message: "You do not own this tenant",
          }),
        );
      }
      return tenant;
    }
    if (tenant.orgId === null) {
      const isOwner =
        !!context.near?.primaryAccountId && context.near.primaryAccountId === tenant.accountId;
      if (!isOwner) {
        return yield* Effect.fail(
          new ORPCError("FORBIDDEN", {
            message: "You do not own this personal tenant",
          }),
        );
      }
      return tenant;
    }
    const activeOrgId = context.organization?.activeOrganizationId;
    if (!activeOrgId || tenant.orgId !== activeOrgId) {
      return yield* Effect.fail(
        new ORPCError("FORBIDDEN", {
          message: "You are not a member of this site's community",
        }),
      );
    }
    if (!isCommunitySettingsRole(context.organization?.member?.role)) {
      return yield* Effect.fail(
        new ORPCError("FORBIDDEN", {
          message: "Community settings require a community owner or admin",
        }),
      );
    }
    return tenant;
  });

const authorizedNodeForValidators = (
  services: { nodes: NodesService; tenants: TenantsService },
  nodeId: string,
  context: NodeAccessContext,
): NodeEffect<NodeRecord> =>
  Effect.gen(function* () {
    const node = yield* resolveNodeForAccess(services, nodeId);
    yield* authorizeNodeAccess(services, node, context, {
      adminBypassOrg: true,
      resource: "validators",
    });
    return node;
  });

export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({
    platformAccount: z.string().optional(),
    platformStationsAccount: z
      .string()
      .default("")
      .describe(
        "NEAR account keying the hidden tenant behind platform stations; must not belong to any community",
      ),
    gatewayDomains: z
      .string()
      .default("")
      .describe(
        "Comma-separated domains whose subdomains the platform controls (auto-verified bindings)",
      ),
    domain: z
      .string()
      .default("localhost")
      .describe("Runtime domain used to identify outbound geocode requests"),
    repository: z
      .string()
      .default("")
      .describe("Repository URL included in the Nominatim User-Agent"),
    nearbuildersUrl: z
      .url({ protocol: /^https?$/ })
      .default("https://nearbuilders.org")
      .describe("NEAR Builders base URL for community builders and projects"),
    lumaMainCalendarId: z
      .string()
      .default("")
      .describe("Luma calendar whose events are associated to places by location"),
    mainnetStakingPoolWhitelist: z
      .string()
      .default("lockup-whitelist.near")
      .describe("Mainnet contract whose is_whitelisted approves staking pools for validators"),
    testnetStakingPoolWhitelist: z
      .string()
      .default("whitelist.f863973.m0")
      .describe("Testnet contract whose is_whitelisted approves staking pools for validators"),
  }),

  secrets: z.object({
    LUMA_CALENDAR_API_KEYS: z.string().default(""),
    LUMA_WEBHOOK_SECRETS: z.string().default(""),
    API_DATABASE_URL: z.string().default("pglite:.bos/api/:memory:"),
    BETTER_AUTH_SECRET: z.string().default(""),
  }),

  context: ContextSchema,

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const database = DatabaseLive(config.secrets.API_DATABASE_URL);
      const gatewayDomains = config.variables.gatewayDomains
        .split(",")
        .map((domain) => domain.trim().toLowerCase())
        .filter((domain) => domain.length > 0);
      const services = yield* buildScopedContext(
        Layer.mergeAll(
          TenantsLive,
          NodesLive,
          PlacesLive,
          ValidatorsLive,
          DiscoveryLive({
            lumaKeys: config.secrets.LUMA_CALENDAR_API_KEYS,
            lumaMainCalendarId: config.variables.lumaMainCalendarId,
            lumaWebhookSecrets: config.secrets.LUMA_WEBHOOK_SECRETS,
          }),
          StorageLive,
          MemberDirectoryLive,
          AttendanceLive,
          TeamJoinRequestsLive,
        ).pipe(Layer.provide(database), Layer.provide(TenantsConfigLive(gatewayDomains))),
      );

      yield* Effect.log("[API] Services Initialized");

      return Layer.mergeAll(
        Layer.succeed(ApiServices, {
          tenants: Context.get(services, TenantsTag),
          nodes: Context.get(services, NodesTag),
          places: Context.get(services, PlacesTag),
          validators: Context.get(services, ValidatorsTag),
          discovery: Context.get(services, DiscoveryTag),
          storage: Context.get(services, StorageTag),
          nearbuilders: createNearbuilders(config.variables.nearbuildersUrl),
          memberDirectory: Context.get(services, MemberDirectoryTag),
          attendance: Context.get(services, AttendanceTag),
          teamJoinRequests: Context.get(services, TeamJoinRequestsTag),
          stakingPools: makeStakingPools({
            mainnet: config.variables.mainnetStakingPoolWhitelist,
            testnet: config.variables.testnetStakingPoolWhitelist,
          }),
          platformStationsAccount: config.variables.platformStationsAccount.trim() || null,
        }),
      );
    }),

  createRouter: (builder, plugins) => {
    const { requireAuth, requireAdmin, requireOrganization, requireOrgRole } =
      createAuthMiddleware<AuthContext>(builder);
    const requireNodeOperations = createRequireTeamArea(builder)("node-operations");
    const memberAuthClient = (context: {
      reqHeaders?: ConstructorParameters<typeof Headers>[0];
      userId: string;
      user?: AuthContext["user"];
    }) =>
      Effect.gen(function* () {
        const authPlugin = plugins.auth;
        if (!authPlugin) {
          return yield* Effect.fail(
            new ORPCError("INTERNAL_SERVER_ERROR", { message: "The auth plugin is not available" }),
          );
        }
        return authPlugin.client({
          reqHeaders: Object.fromEntries(new Headers(context.reqHeaders).entries()),
          userId: context.userId,
          user: context.user,
        });
      });

    type MemberAuthClient = Effect.Success<ReturnType<typeof memberAuthClient>>;

    const monthlyExternalStats =
      (
        attendance: AttendanceService,
        context: {
          reqHeaders?: ConstructorParameters<typeof Headers>[0];
          userId?: string | null;
          user?: AuthContext["user"];
        },
      ): MonthlyExternalStats =>
      ({ organizationId, month, window }) =>
        Effect.gen(function* () {
          const userId = context.userId;
          if (!userId) return yield* Effect.fail(new ORPCError("UNAUTHORIZED"));
          const auth = yield* memberAuthClient({ ...context, userId });
          const [checkIns, onboarding] = yield* Effect.all([
            attendance.monthlyCheckIns(organizationId, window),
            Effect.tryPromise({
              try: () => auth.getOnboardingStats({ month, organizationId }),
              catch: () =>
                new ORPCError("INTERNAL_SERVER_ERROR", {
                  message: "Could not load this month's joins",
                }),
            }),
          ]);
          return {
            checkIns,
            joins: onboarding.totals.redeemed,
            newMembers: onboarding.totals.newMembers,
          };
        });

    const callAuth = <T>(run: () => Promise<T>, message: string) =>
      Effect.tryPromise({
        try: run,
        catch: (error) =>
          error instanceof ORPCError ? error : new ORPCError("INTERNAL_SERVER_ERROR", { message }),
      });

    const readPlatformStations = (context: {
      reqHeaders?: ConstructorParameters<typeof Headers>[0];
      userId: string;
      user?: AuthContext["user"];
    }) =>
      Effect.gen(function* () {
        const services = yield* ApiServices;
        const account = services.platformStationsAccount;
        if (!account) return { account: null, organization: null };
        const tenant = yield* services.tenants.resolveTenantByAccountId(account);
        const organizationId = tenant?.orgId;
        if (!tenant || !organizationId) return { account, organization: null };
        const [node] = yield* services.nodes.list({
          tenantId: tenant.id,
          kind: PLATFORM_NODE_KIND,
          includePlatform: true,
        });
        if (!node) return { account, organization: null };
        const auth = yield* memberAuthClient(context);
        const organization = yield* callAuth(
          () => auth.getOrganizationForAdmin({ organizationId }),
          "Could not read the platform community",
        );
        if (!organization) return { account, organization: null };
        const role = yield* callAuth(
          () =>
            auth.getActiveMemberRole({ organizationId }).then(
              (result) => result.role,
              (error: unknown) => {
                if (error instanceof ORPCError && error.code === "FORBIDDEN") return null;
                throw error;
              },
            ),
          "Could not read your role in the platform community",
        );
        return {
          account,
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            nodeId: node.id,
            role,
          },
        };
      });

    const notACommunityMember = () =>
      new ORPCError("FORBIDDEN", { message: "You are not a member of this community" });

    const readOwnPrimaryAccount = (auth: MemberAuthClient) =>
      Effect.tryPromise(() => auth.nearListAccounts()).pipe(
        Effect.map(
          ({ accounts }) => accounts.find((account) => account.isPrimary)?.accountId ?? null,
        ),
        Effect.orElseSucceed(() => null),
      );

    const memberReadFailure = (message: string) => (error: unknown) =>
      error instanceof ORPCError && ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(error.code)
        ? notACommunityMember()
        : new ORPCError("INTERNAL_SERVER_ERROR", { message });

    const listMemberPage = (
      auth: MemberAuthClient,
      organizationId: string,
      page: { limit: number; offset: number },
    ) =>
      Effect.tryPromise({
        try: () => auth.listMembers({ organizationId, ...page }),
        catch: memberReadFailure("Could not load the community's members"),
      });

    const findMembers = (auth: MemberAuthClient, organizationId: string, wanted: Set<string>) =>
      Effect.gen(function* () {
        const found = new Map<string, string | null>();
        let offset = 0;
        while (found.size < wanted.size) {
          const page = yield* listMemberPage(auth, organizationId, {
            limit: MEMBER_PAGE_SIZE,
            offset,
          });
          offset += page.members.length;
          for (const member of page.members) {
            if (member.organizationId === organizationId && wanted.has(member.userId)) {
              found.set(member.userId, member.user?.name ?? null);
            }
          }
          if (page.members.length === 0 || offset >= page.total) break;
        }
        return found;
      });

    const requireCommunityMember = (auth: MemberAuthClient, organizationId: string) =>
      Effect.gen(function* () {
        const { role } = yield* Effect.tryPromise({
          try: () => auth.getActiveMemberRole({ organizationId }),
          catch: memberReadFailure("Could not verify community membership"),
        });
        if (!role) return yield* Effect.fail(notACommunityMember());
        return role;
      });

    const teamJoinConflict = (message: string) => new ORPCError("CONFLICT", { message });

    const loadTeamCommunity = (
      auth: MemberAuthClient,
      organizationId: string,
      viewer: { userId: string; name: string | null },
    ) =>
      Effect.gen(function* () {
        const services = yield* ApiServices;
        const { userId } = viewer;
        const role = yield* requireCommunityMember(auth, organizationId);
        const [teams, ownTeams] = yield* Effect.tryPromise({
          try: () =>
            Promise.all([
              auth.listTeams({ organizationId }),
              auth.listUserTeams({ organizationId }),
            ]),
          catch: () =>
            new ORPCError("INTERNAL_SERVER_ERROR", {
              message: "Could not load the community's teams",
            }),
        });
        const stored = yield* services.teamJoinRequests.list(organizationId, userId);
        const requesters = new Set(
          stored
            .filter((request) => request.status === "pending" && request.requesterUserId !== userId)
            .map((request) => request.requesterUserId),
        );
        const names = yield* findMembers(auth, organizationId, requesters);
        names.set(userId, viewer.name);
        const community = {
          memberIds: new Set(names.keys()),
          names,
          teams: new Map<string, UpstreamTeam>(teams.map((team) => [team.id, team])),
        };
        const closures = stored.flatMap((request) => {
          if (request.status !== "pending") return [];
          const reason = closureReason(request, community);
          return reason ? [{ id: request.id, reason }] : [];
        });
        if (closures.length > 0) yield* services.teamJoinRequests.close(closures);
        const requests =
          closures.length > 0
            ? yield* services.teamJoinRequests.list(organizationId, userId)
            : stored;
        return {
          ...community,
          userId,
          organizationId,
          canReview: isCommunitySettingsRole(role),
          ownTeamIds: new Set(ownTeams.map((team) => team.id)),
          requests,
        };
      });

    type TeamCommunity = Effect.Success<ReturnType<typeof loadTeamCommunity>>;

    const presentTeamRequest = (community: TeamCommunity, request: TeamJoinRequestRecord) => {
      const pending = request.status === "pending";
      const onTeam = community.ownTeamIds.has(request.teamId);
      return {
        id: request.id,
        teamId: request.teamId,
        teamName: community.teams.get(request.teamId)?.name ?? request.teamName,
        teamAreas: recognizedAreas(community.teams.get(request.teamId)?.areas ?? request.teamAreas),
        requesterName:
          memberDisplayName(community.names.get(request.requesterUserId)) ??
          memberDisplayName(request.requesterName),
        isMine: request.requesterUserId === community.userId,
        status: request.status,
        closedReason: request.closedReason,
        endorsementCount: request.endorserUserIds.length,
        endorsedByMe: request.endorserUserIds.includes(community.userId),
        canEndorse: pending && onTeam && request.requesterUserId !== community.userId,
        canDecide: pending && community.canReview,
        createdAt: request.createdAt.toISOString(),
        decidedAt: request.decidedAt?.toISOString() ?? null,
        dismissedAt: request.dismissedAt?.toISOString() ?? null,
      };
    };

    const canSeeTeamRequest = (community: TeamCommunity, request: TeamJoinRequestRecord) => {
      if (request.requesterUserId === community.userId) {
        if (request.status === "approved") return request.dismissedAt === null;
        return request.status !== "withdrawn";
      }
      if (request.status === "pending") {
        return community.canReview || community.ownTeamIds.has(request.teamId);
      }
      return request.status === "closed" && community.canReview;
    };

    const loadTeamRequest = (context: Parameters<typeof memberAuthClient>[0], requestId: string) =>
      Effect.gen(function* () {
        const services = yield* ApiServices;
        const stored = yield* services.teamJoinRequests.get(requestId);
        if (!stored) {
          return yield* Effect.fail(
            new ORPCError("NOT_FOUND", { message: "Team request not found" }),
          );
        }
        const auth = yield* memberAuthClient(context);
        const community = yield* loadTeamCommunity(auth, stored.organizationId, {
          userId: context.userId,
          name: context.user?.name ?? null,
        });
        const request = community.requests.find((candidate) => candidate.id === requestId);
        if (!request || !canSeeTeamRequest(community, request)) {
          return yield* Effect.fail(
            new ORPCError("NOT_FOUND", { message: "Team request not found" }),
          );
        }
        return { auth, community, request };
      });

    const refreshTeamRequest = (community: TeamCommunity, requestId: string) =>
      Effect.gen(function* () {
        const services = yield* ApiServices;
        const request = yield* services.teamJoinRequests.get(requestId);
        if (!request) {
          return yield* Effect.fail(
            new ORPCError("NOT_FOUND", { message: "Team request not found" }),
          );
        }
        return presentTeamRequest(community, request);
      });

    const requirePendingTeamRequest = (request: TeamJoinRequestRecord) =>
      request.status === "pending"
        ? Effect.void
        : Effect.fail(teamJoinConflict("This team request is no longer pending"));

    const router = {
      trackDiscovery: builder.trackDiscovery.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.track(input, context);
      }),
      getDiscoveryMetrics: builder.getDiscoveryMetrics.effect(function* ({ context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.metrics(context);
      }),
      getDiscoveryEventStats: builder.getDiscoveryEventStats.effect(function* ({ context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.eventStats(context);
      }),
      getDiscoveryStudio: builder.getDiscoveryStudio.effect(function* ({ context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.studio(context);
      }),
      setDiscoveryCurator: builder.setDiscoveryCurator.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.setCurator(input, context);
      }),
      featureDiscoveryNode: builder.featureDiscoveryNode.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.feature(input, context);
      }),
      reportDiscoveryContent: builder.reportDiscoveryContent.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.discovery.report(input);
      }),
      moderateDiscoveryReport: builder.moderateDiscoveryReport.effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        return yield* services.discovery.moderate(input, context);
      }),
      getDiscoveryHistory: builder.getDiscoveryHistory.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.history(input.nodeId, context);
      }),
      listDiscoveryLumaCalendars: builder.listDiscoveryLumaCalendars.effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        return yield* services.discovery.lumaCalendars(input.nodeId, context);
      }),
      disconnectDiscoveryLuma: builder.disconnectDiscoveryLuma.effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        return yield* services.discovery.disconnectLuma(input.nodeId, context);
      }),
      receiveLumaWebhook: builder.receiveLumaWebhook.effect(function* ({ context }) {
        const services = yield* ApiServices;
        const rawBody = yield* Effect.promise(() => context.getRawBody?.() ?? Promise.resolve(""));
        return yield* services.discovery.receiveLumaWebhook({
          signature: context.reqHeaders?.get("webhook-signature") ?? null,
          rawBody,
        });
      }),
      receiveLumaCalendarWebhook: builder.receiveLumaCalendarWebhook.effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const rawBody = yield* Effect.promise(() => context.getRawBody?.() ?? Promise.resolve(""));
        return yield* services.discovery.receiveLumaWebhook({
          signature: context.reqHeaders?.get("webhook-signature") ?? null,
          rawBody,
          calendarId: input.calendarId,
        });
      }),
      listDiscoveryLumaTriage: builder.listDiscoveryLumaTriage.effect(function* ({ context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.lumaTriage(context);
      }),
      associateDiscoveryLumaEvent: builder.associateDiscoveryLumaEvent.effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        return yield* services.discovery.associateLumaEvent(input, context);
      }),
      backfillDiscoveryLumaPlaceEvents: builder.backfillDiscoveryLumaPlaceEvents.effect(function* ({
        context,
      }) {
        const services = yield* ApiServices;
        return yield* services.discovery.backfillLumaPlaceEvents(context);
      }),
      importDiscoveryLuma: builder.importDiscoveryLuma.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.importLuma(input, context);
      }),
      saveDiscoveryActivity: builder.saveDiscoveryActivity.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.saveActivity(input, context);
      }),
      listDiscoveryActivities: builder.listDiscoveryActivities.effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        return yield* services.discovery.activities(input.nodeId, context);
      }),
      getDiscoveryActivity: builder.getDiscoveryActivity.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.discovery.activity(input.id);
      }),
      getEventReport: builder.getEventReport.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.eventReport(input.activityId, context);
      }),
      saveEventReport: builder.saveEventReport.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.saveEventReport(input, context);
      }),
      listEventReportStatuses: builder.listEventReportStatuses.effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        return yield* services.discovery.eventReportStatuses(input.nodeId, context);
      }),
      getMonthlyReport: builder.getMonthlyReport.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        const result = yield* services.discovery.monthlyReport(
          input,
          context,
          monthlyExternalStats(services.attendance, context),
        );
        const syncedAt =
          result.canEdit && result.open && result.organizationId
            ? yield* services.attendance.lastSyncedAt(result.organizationId)
            : null;
        return { ...result, checkInsSyncedAt: syncedAt?.toISOString() ?? null };
      }),
      saveMonthlyReport: builder.saveMonthlyReport.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.saveMonthlyReport(
          input,
          context,
          monthlyExternalStats(services.attendance, context),
        );
      }),
      listMonthlyReportStatuses: builder.listMonthlyReportStatuses.effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        return yield* services.discovery.monthlyReportStatuses(input.nodeId, context);
      }),
      listReportCommunities: builder.listReportCommunities.use(requireAuth).effect(function* ({
        context,
      }) {
        const services = yield* ApiServices;
        const auth = yield* memberAuthClient(context);
        const organizations = (yield* callAuth(
          () => auth.listOrganizations(),
          "Could not load your communities",
        )).filter(
          (organization) =>
            organization.status === "active" &&
            organization.slug !== context.userId &&
            organization.metadata?.isPersonal !== true,
        );
        const communities = yield* Effect.forEach(
          organizations,
          (organization) =>
            Effect.gen(function* () {
              const { role } = yield* callAuth(
                () => auth.getActiveMemberRole({ organizationId: organization.id }),
                "Could not read your role",
              );
              const organizer =
                role === "owner" ||
                role === "admin" ||
                (!!role &&
                  (yield* callAuth(
                    () => auth.listUserTeams({ organizationId: organization.id }),
                    "Could not read your teams",
                  )).some((team) => team.areas.includes("events")));
              if (!organizer) return [];
              const tenant = yield* services.tenants.resolveTenantByOrgId(organization.id);
              if (!tenant || tenant.status !== "active" || tenant.deletedAt) return [];
              const nodes = (yield* services.nodes.list({ tenantId: tenant.id })).sort(
                (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
              );
              const [node] = nodes;
              if (!node) return [];
              return [
                {
                  organizationId: organization.id,
                  slug: organization.slug,
                  name: tenant.name,
                  nodeId: node.id,
                  nodeIds: nodes.map(({ id }) => id),
                },
              ];
            }),
          { concurrency: 4 },
        );
        return {
          communities: communities.flat().sort((a, b) => a.name.localeCompare(b.name)),
          memberships: organizations.length,
        };
      }),
      createEventOnboardingCode: builder.createEventOnboardingCode.effect(function* ({
        input,
        context,
        errors,
      }) {
        if (!context.userId) {
          return yield* Effect.fail(
            errors.UNAUTHORIZED({
              message: "Authentication required",
              data: { apiKeyProvided: !!context.apiKey },
            }),
          );
        }
        const services = yield* ApiServices;
        const record = yield* services.discovery.eventOrganization(input.eventId);
        if (!record) {
          return yield* Effect.fail(errors.NOT_FOUND({ message: "Event not found", data: {} }));
        }
        const { event, organizationId } = record;
        const endsAt = event.endsAt;
        if (event.kind !== "event" || !endsAt) {
          return yield* Effect.fail(
            errors.BAD_REQUEST({ message: "Only events can have onboarding codes", data: {} }),
          );
        }
        if (!organizationId) {
          return yield* Effect.fail(
            errors.BAD_REQUEST({
              message:
                "This event's node has no community, so there is nothing for attendees to join",
              data: {},
            }),
          );
        }
        if (context.organization?.activeOrganizationId !== organizationId) {
          return yield* Effect.fail(
            errors.FORBIDDEN({
              message:
                "This event belongs to another community than your active one — switch communities to onboard for it",
              data: {},
            }),
          );
        }
        const authPlugin = plugins.auth;
        if (!authPlugin) {
          return yield* Effect.fail(
            new ORPCError("INTERNAL_SERVER_ERROR", { message: "The auth plugin is not available" }),
          );
        }
        const auth = authPlugin.client({
          reqHeaders: Object.fromEntries(new Headers(context.reqHeaders).entries()),
        });
        const expiresAt = input.expiresAt
          ? DateTime.toDateUtc(DateTime.makeUnsafe(input.expiresAt))
          : DateTime.toDateUtc(DateTime.makeUnsafe(Date.parse(endsAt) + ONBOARDING_GRACE_MS));
        return yield* Effect.tryPromise<
          z.infer<typeof EventOnboardingCodeSchema>,
          ORPCError<string, unknown>
        >({
          try: () =>
            auth
              .createOnboardingCode({
                organizationId,
                eventId: event.id,
                eventName: event.title,
                ...(input.maxUses ? { maxUses: input.maxUses } : {}),
                expiresAt,
              })
              .then((code) => ({ ...code, eventName: code.eventName ?? event.title })),
          catch: (error) =>
            error instanceof ORPCError
              ? error
              : new ORPCError("INTERNAL_SERVER_ERROR", {
                  message: "Could not create the onboarding code",
                }),
        });
      }),
      listDiscovery: builder.listDiscovery.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.discovery.directory(input);
      }),
      getDiscoveryNode: builder.getDiscoveryNode.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.discovery.get(input.nodeId);
      }),
      getCommunityBuilders: builder.getCommunityBuilders.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const path = yield* communityPath(input.nodeId, (id) => services.nodes.getById(id));
        if (!path) return null;
        return yield* Effect.promise(() => services.nearbuilders.forPath(path));
      }),
      getDiscoveryProfile: builder.getDiscoveryProfile.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.profile(input.nodeId, context);
      }),
      saveDiscoveryProfile: builder.saveDiscoveryProfile.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        return yield* services.discovery.saveProfile(input, context);
      }),
      getMemberDirectoryOptIn: builder.getMemberDirectoryOptIn.use(requireAuth).effect(function* ({
        context,
      }) {
        const services = yield* ApiServices;
        return { optedIn: yield* services.memberDirectory.isOptedIn(context.userId) };
      }),

      setMemberDirectoryOptIn: builder.setMemberDirectoryOptIn.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const primaryAccountId = input.optedIn
          ? yield* readOwnPrimaryAccount(yield* memberAuthClient(context))
          : null;
        return {
          optedIn: yield* services.memberDirectory.setOptIn(
            context.userId,
            input.optedIn,
            primaryAccountId,
          ),
        };
      }),

      getMemberDirectory: builder.getMemberDirectory.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const auth = yield* memberAuthClient(context);
        yield* requireCommunityMember(auth, input.organizationId);
        if (
          input.cursor === undefined &&
          (yield* services.memberDirectory.isOptedIn(context.userId))
        ) {
          yield* services.memberDirectory.refreshPrimaryAccount(
            context.userId,
            yield* readOwnPrimaryAccount(auth),
          );
        }
        const start = Number(input.cursor ?? 0);
        let scanned = start;
        let total = 0;
        let pages = 0;
        let shown: Array<{ userId: string; name: string | null; accountId: string | null }> = [];
        while (true) {
          const page = yield* listMemberPage(auth, input.organizationId, {
            limit: input.limit,
            offset: scanned,
          });
          total = page.total;
          pages += 1;
          scanned += page.members.length;
          const current = page.members.filter(
            (member) => member.organizationId === input.organizationId,
          );
          const accounts = yield* services.memberDirectory.optedInAccounts(
            current.map((member) => member.userId),
          );
          shown = current
            .filter((member) => accounts.has(member.userId))
            .map((member) => ({
              userId: member.userId,
              name: member.user?.name?.trim() || null,
              accountId: accounts.get(member.userId) ?? null,
            }));
          if (
            shown.length > 0 ||
            page.members.length === 0 ||
            scanned >= total ||
            pages >= MEMBER_DIRECTORY_SCAN_PAGES
          ) {
            break;
          }
        }
        const observation = yield* services.memberDirectory.recordCount(
          input.organizationId,
          total,
        );
        return {
          ...observation,
          members: shown,
          nextCursor: scanned > start && scanned < total ? String(scanned) : null,
        };
      }),

      getNodeMemberCount: builder.getNodeMemberCount.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const unavailable = { count: null, observedAt: null };
        const node = yield* services.nodes.getById(input.nodeId);
        if (!node?.tenantId) return unavailable;
        const tenant = yield* services.tenants.resolveTenantById(node.tenantId);
        if (!tenant?.orgId) return unavailable;
        return (yield* services.memberDirectory.latestCount(tenant.orgId)) ?? unavailable;
      }),

      getNodeDao: builder.getNodeDao.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const none = { daoAccountId: null, network: null };
        const node = yield* services.nodes.getById(input.nodeId);
        if (!node) return none;
        return officialDaoOf(node) ?? none;
      }),

      getOnboardCommunity: builder.getOnboardCommunity.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const notFound = () =>
          new ORPCError("NOT_FOUND", { message: "No City Node for this community" });
        const tenant = yield* services.tenants.resolveTenantByOrgId(input.organizationId);
        if (!tenant || tenant.status !== "active") return yield* Effect.fail(notFound());
        const [node] = (yield* services.nodes.list({ tenantId: tenant.id })).sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        );
        if (!node) return yield* Effect.fail(notFound());
        const listing = yield* services.discovery
          .get(node.id)
          .pipe(Effect.orElseSucceed(() => null));
        return {
          name: node.name,
          href: `/n/${encodeURIComponent(node.slug)}${
            node.parentId ? `?parentId=${encodeURIComponent(node.parentId)}` : ""
          }`,
          channels: (listing?.channels ?? []).map(({ label, url }) => ({ label, url })),
        };
      }),

      reconcileAttendance: builder.reconcileAttendance.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const auth = yield* memberAuthClient(context);
        const { organizationId } = input;
        const community = (yield* services.discovery.organizationEvents([organizationId])).get(
          organizationId,
        );
        return yield* services.attendance.reconcile({
          organizationId,
          communityName: community?.communityName ?? organizationId,
          events: community?.events ?? [],
          upstream: {
            listCodes: (eventId) =>
              auth.listOnboardingCodes({ organizationId, ...(eventId ? { eventId } : {}) }),
            codeStatus: (codeId) => auth.getOnboardingStatus({ codeId, organizationId }),
          },
        });
      }),

      getMyAttendance: builder.getMyAttendance.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const auth = yield* memberAuthClient(context);
        const memberships = yield* Effect.tryPromise({
          try: () => auth.listOrganizations(),
          catch: () =>
            new ORPCError("INTERNAL_SERVER_ERROR", {
              message: "Could not load your communities",
            }),
        });
        const names = new Map(
          memberships.map((organization) => [organization.id, organization.name]),
        );
        if (input.organizationId && !names.has(input.organizationId)) {
          return yield* Effect.fail(notACommunityMember());
        }
        const organizationIds = input.organizationId
          ? [input.organizationId]
          : [
              ...new Set([
                ...names.keys(),
                ...(yield* services.attendance.recordedOrganizations(context.userId)),
              ]),
            ];
        const eventsByOrganization = yield* services.discovery.organizationEvents(organizationIds);
        const communities = organizationIds.map((organizationId) => {
          const community = eventsByOrganization.get(organizationId);
          return {
            organizationId,
            communityName: community?.communityName ?? names.get(organizationId) ?? organizationId,
            events: community?.events ?? [],
          };
        });
        return yield* services.attendance.history({ userId: context.userId, communities });
      }),

      getPlatformAttendance: builder.getPlatformAttendance
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ input }) {
          const services = yield* ApiServices;
          const { from, to } = reportMonthWindow(input.month);
          const attendance = yield* services.attendance.platformAttendance({ from, to });
          return { month: input.month, ...attendance };
        }),

      getCommunityEngagement: builder.getCommunityEngagement
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* () {
          const services = yield* ApiServices;
          const [counts, checkIns] = yield* Effect.all([
            services.memberDirectory.latestCounts(),
            services.attendance.engagement(),
          ]);
          const checkInsByOrganization = new Map(
            checkIns.map(({ organizationId, ...rest }) => [organizationId, rest]),
          );
          const organizationIds = new Set([...counts.keys(), ...checkInsByOrganization.keys()]);
          return {
            communities: [...organizationIds].sort().map((organizationId) => ({
              organizationId,
              memberCount: counts.get(organizationId) ?? null,
              checkIns: checkInsByOrganization.get(organizationId) ?? null,
            })),
          };
        }),

      getAdminEvents: builder.getAdminEvents
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ context }) {
          const services = yield* ApiServices;
          const [events, attendance] = yield* Effect.all([
            services.discovery.adminEvents(context),
            services.attendance.eventAttendance(),
          ]);
          const byEvent = new Map(
            attendance.map(({ organizationId, eventId, ...rest }) => [
              `${organizationId}:${eventId}`,
              rest,
            ]),
          );
          return {
            events: events.map((event) => ({
              ...event,
              checkIns: event.organizationId
                ? (byEvent.get(`${event.organizationId}:${event.id}`) ?? null)
                : null,
            })),
          };
        }),

      getAdminMonthlyReports: builder.getAdminMonthlyReports
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          const rows = yield* services.discovery.adminMonthlyReports(input.month, context);
          const auth = yield* memberAuthClient(context);
          const slugs = yield* Effect.tryPromise(async () => {
            const found = new Map<string, string>();
            for (let offset = 0; ; offset += ORGANIZATION_PAGE) {
              const page = await auth.adminListOrganizations({ limit: ORGANIZATION_PAGE, offset });
              for (const organization of page.organizations) {
                found.set(organization.id, organization.slug);
              }
              if (page.organizations.length < ORGANIZATION_PAGE || found.size >= page.total) {
                return found;
              }
            }
          }).pipe(Effect.orElseSucceed(() => new Map<string, string>()));
          const communities = rows.map(({ report, ...row }) => ({
            ...row,
            slug: slugs.get(row.organizationId) ?? null,
            status: !report
              ? ("missing" as const)
              : report.reviewedAt
                ? ("reviewed" as const)
                : ("submitted" as const),
            report: report && {
              submittedAt: report.submittedAt,
              submittedByName: report.submittedByName,
              updatedAt: report.updatedAt,
              reviewedAt: report.reviewedAt,
              stats: report.stats,
            },
          }));
          return { month: input.month, communities };
        }),

      reviewMonthlyReport: builder.reviewMonthlyReport
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          return yield* services.discovery.reviewMonthlyReport(input, context);
        }),

      reviewEventReport: builder.reviewEventReport
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          return yield* services.discovery.reviewEventReport(input, context);
        }),

      getCommunityTeamRequests: builder.getCommunityTeamRequests
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ input }) {
          const services = yield* ApiServices;
          const requests = yield* services.teamJoinRequests.listAll(input.organizationId);
          const teams = new Map<
            string,
            {
              teamId: string;
              teamName: string;
              teamAreas: ReturnType<typeof recognizedAreas>;
              pending: number;
              approved: number;
              lastRequestAt: string;
            }
          >();
          for (const request of requests) {
            const team = teams.get(request.teamId) ?? {
              teamId: request.teamId,
              teamName: request.teamName,
              teamAreas: recognizedAreas(request.teamAreas),
              pending: 0,
              approved: 0,
              lastRequestAt: request.createdAt.toISOString(),
            };
            if (request.status === "pending") team.pending += 1;
            if (request.status === "approved") team.approved += 1;
            team.teamName = request.teamName;
            team.teamAreas = recognizedAreas(request.teamAreas);
            team.lastRequestAt = request.createdAt.toISOString();
            teams.set(request.teamId, team);
          }
          return {
            teams: [...teams.values()].sort((a, b) => a.teamName.localeCompare(b.teamName)),
            pending: requests
              .filter((request) => request.status === "pending")
              .map((request) => ({
                id: request.id,
                teamName: request.teamName,
                requesterName: request.requesterName,
                endorsementCount: request.endorserUserIds.length,
                createdAt: request.createdAt.toISOString(),
              })),
          };
        }),

      getPlatformStations: builder.getPlatformStations
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ context }) {
          return yield* readPlatformStations(context);
        }),

      setUpPlatformStations: builder.setUpPlatformStations
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ input, context, errors }) {
          const services = yield* ApiServices;
          const account = services.platformStationsAccount;
          if (!account) {
            return yield* Effect.fail(
              errors.BAD_REQUEST({
                message: "Set platformStationsAccount before setting up platform stations",
                data: {},
              }),
            );
          }
          yield* validateAccountId(account);
          const auth = yield* memberAuthClient(context);
          const tenant = yield* services.tenants.resolveTenantByAccountId(account);
          const tenantOrganizationId = tenant?.orgId ?? null;
          const tenantOrganization = tenantOrganizationId
            ? yield* callAuth(
                () => auth.getOrganizationForAdmin({ organizationId: tenantOrganizationId }),
                "Could not read the platform community",
              )
            : null;
          if (tenant && (!tenantOrganization || !isPlatformOrganization(tenantOrganization))) {
            return yield* Effect.fail(
              errors.CONFLICT({
                message: "The stations account already belongs to another tenant",
              }),
            );
          }
          if (tenant) {
            const [node] = yield* services.nodes.list({
              tenantId: tenant.id,
              kind: PLATFORM_NODE_KIND,
              includePlatform: true,
            });
            if (node) {
              return yield* Effect.fail(
                errors.CONFLICT({ message: "Platform stations are already set up" }),
              );
            }
          }
          const previousActiveOrganizationId = context.organization?.activeOrganizationId ?? null;
          const organizationId =
            tenantOrganization?.id ??
            (yield* callAuth(
              () => createPlatformOrganization(auth, { name: input.name, slug: input.slug }),
              "Could not create the platform community",
            )).id;
          if (!tenantOrganization) {
            yield* callAuth(
              () => auth.setActiveOrganization({ organizationId: previousActiveOrganizationId }),
              "Could not restore your active community",
            ).pipe(
              Effect.tapError(() =>
                callAuth(
                  () => auth.deleteOrganization({ organizationId }),
                  "Could not remove the unused platform community",
                ).pipe(Effect.ignore),
              ),
            );
          }
          const stationsTenant =
            tenant ??
            (yield* services.tenants
              .createTenant({
                name: input.name,
                accountId: account,
                orgId: organizationId,
                status: "active",
                ownerKind: "platform",
                allowUiOverrides: false,
              })
              .pipe(
                Effect.tapError(() =>
                  callAuth(
                    () => auth.deleteOrganization({ organizationId }),
                    "Could not remove the unused platform community",
                  ).pipe(Effect.ignore),
                ),
              ));
          yield* services.nodes.spawn({
            kind: PLATFORM_NODE_KIND,
            tenantId: stationsTenant.id,
          });
          return yield* readPlatformStations(context);
        }),

      joinPlatformStations: builder.joinPlatformStations
        .use(requireAuth)
        .use(requireAdmin)
        .effect(function* ({ context, errors }) {
          const current = yield* readPlatformStations(context);
          if (!current.organization) {
            return yield* Effect.fail(
              errors.NOT_FOUND({ message: "Platform stations are not set up", data: {} }),
            );
          }
          if (current.organization.role) return current;
          const auth = yield* memberAuthClient(context);
          const organizationId = current.organization.id;
          yield* callAuth(
            () => auth.addMember({ userId: context.userId, role: "admin", organizationId }),
            "Could not add you to the platform community",
          );
          return yield* readPlatformStations(context);
        }),

      getTeamJoinBoard: builder.getTeamJoinBoard.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const auth = yield* memberAuthClient(context);
        const community = yield* loadTeamCommunity(auth, input.organizationId, {
          userId: context.userId,
          name: context.user?.name ?? null,
        });
        const pendingByTeam = new Map(
          community.requests
            .filter(
              (request) =>
                request.status === "pending" && request.requesterUserId === community.userId,
            )
            .map((request) => [request.teamId, request.id]),
        );
        return {
          canReview: community.canReview,
          teams: [...community.teams.values()].filter(isJoinableTeam).map((team) => ({
            id: team.id,
            name: team.name,
            areas: recognizedAreas(team.areas),
            isMember: community.ownTeamIds.has(team.id),
            pendingRequestId: pendingByTeam.get(team.id) ?? null,
          })),
          requests: community.requests
            .filter((request) => canSeeTeamRequest(community, request))
            .map((request) => presentTeamRequest(community, request)),
        };
      }),

      requestToJoinTeam: builder.requestToJoinTeam.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const auth = yield* memberAuthClient(context);
        const community = yield* loadTeamCommunity(auth, input.organizationId, {
          userId: context.userId,
          name: context.user?.name ?? null,
        });
        const team = community.teams.get(input.teamId);
        if (!isJoinableTeam(team)) {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", { message: "This team isn't open to requests" }),
          );
        }
        if (community.ownTeamIds.has(team.id)) {
          return yield* Effect.fail(teamJoinConflict("You're already on this team"));
        }
        const created = yield* services.teamJoinRequests.create({
          organizationId: input.organizationId,
          teamId: team.id,
          teamName: team.name,
          teamAreas: recognizedAreas(team.areas),
          requesterUserId: context.userId,
          requesterName: memberDisplayName(community.names.get(context.userId)),
        });
        if (!created) {
          return yield* Effect.fail(teamJoinConflict("You already asked to join this team"));
        }
        return presentTeamRequest(community, created);
      }),

      withdrawTeamJoinRequest: builder.withdrawTeamJoinRequest.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const { community, request } = yield* loadTeamRequest(context, input.requestId);
        if (request.requesterUserId !== context.userId) {
          return yield* Effect.fail(
            new ORPCError("FORBIDDEN", { message: "Only the requester can withdraw it" }),
          );
        }
        yield* requirePendingTeamRequest(request);
        if (!(yield* services.teamJoinRequests.settle(request.id, "withdrawn", context.userId))) {
          return yield* Effect.fail(teamJoinConflict("This team request is no longer pending"));
        }
        return yield* refreshTeamRequest(community, request.id);
      }),

      endorseTeamJoinRequest: builder.endorseTeamJoinRequest.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const { community, request } = yield* loadTeamRequest(context, input.requestId);
        yield* requirePendingTeamRequest(request);
        if (!presentTeamRequest(community, request).canEndorse) {
          return yield* Effect.fail(
            new ORPCError("FORBIDDEN", {
              message: "Only current members of this team can endorse it",
            }),
          );
        }
        yield* services.teamJoinRequests.endorse(request.id, context.userId);
        return yield* refreshTeamRequest(community, request.id);
      }),

      decideTeamJoinRequest: builder.decideTeamJoinRequest.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const { auth, community, request } = yield* loadTeamRequest(context, input.requestId);
        if (!community.canReview) {
          return yield* Effect.fail(
            new ORPCError("FORBIDDEN", {
              message: "Only the community's owners and admins can decide team requests",
            }),
          );
        }
        yield* requirePendingTeamRequest(request);
        if (input.decision === "approve") {
          yield* Effect.tryPromise({
            try: () =>
              auth.addTeamMember({
                teamId: request.teamId,
                userId: request.requesterUserId,
                organizationId: request.organizationId,
              }),
            catch: (error) =>
              error instanceof ORPCError
                ? error
                : new ORPCError("CONNECTION_ERROR", {
                    message: "Couldn't add them to the team. Try again.",
                  }),
          });
        }
        const settled = yield* services.teamJoinRequests.settle(
          request.id,
          input.decision === "approve" ? "approved" : "declined",
          context.userId,
        );
        if (!settled) {
          return yield* Effect.fail(teamJoinConflict("This team request is no longer pending"));
        }
        return yield* refreshTeamRequest(community, request.id);
      }),

      dismissTeamJoinRequest: builder.dismissTeamJoinRequest.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const { community, request } = yield* loadTeamRequest(context, input.requestId);
        if (request.requesterUserId !== context.userId) {
          return yield* Effect.fail(
            new ORPCError("FORBIDDEN", { message: "Only the requester can dismiss it" }),
          );
        }
        if (request.status !== "approved" && request.status !== "declined") {
          return yield* Effect.fail(teamJoinConflict("This team request hasn't been decided"));
        }
        if (!(yield* services.teamJoinRequests.dismiss(request.id, context.userId))) {
          return yield* Effect.fail(teamJoinConflict("This team request was already dismissed"));
        }
        return yield* refreshTeamRequest(community, request.id);
      }),

      ping: builder.ping.handler(async () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
      })),

      listTenants: builder.listTenants.use(requireAuth).effect(function* ({ context }) {
        const services = yield* ApiServices;
        if (context.user?.role === "admin") {
          return yield* services.tenants.listAllTenants;
        }
        const ownerTenants = yield* services.tenants.listTenantsByOwnerUserId(context.user.id);
        const orgId = context.organization?.activeOrganizationId;
        if (
          !orgId ||
          (!isCommunitySettingsRole(context.organization?.member?.role) &&
            !canUseTeamArea(context, "node-operations"))
        ) {
          return ownerTenants;
        }
        const orgTenants = yield* services.tenants.listTenantsByOrgIds([orgId]);
        return [...ownerTenants, ...orgTenants.filter((t) => t.ownerUserId === null)];
      }),

      spawnTenant: builder.spawnTenant.use(requireAuth).effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        const ownerAccountId = context.near?.primaryAccountId;
        if (!ownerAccountId) {
          return yield* Effect.fail(
            new ORPCError("FORBIDDEN", {
              message: "Link a NEAR account to your session before spawning a tenant",
            }),
          );
        }
        yield* validateAccountId(ownerAccountId);
        yield* validateHostname(input.hostname);
        const { tenant, binding } = yield* services.tenants.spawnTenant({
          name: input.name,
          hostname: input.hostname.toLowerCase(),
          ownerAccountId,
          ownerUserId: context.user.id,
        });
        return { tenant, binding, ownerAccountId, publishStatus: publishStatusFor(ownerAccountId) };
      }),

      getSpawnStatus: builder.getSpawnStatus.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const tenant = yield* authorizedTenant(services, input, context);
        const bindings = yield* services.tenants.listBindingsForTenant(tenant.id);
        return {
          tenant,
          bindings,
          ownerAccountId: tenant.accountId,
          publishStatus: publishStatusFor(tenant.accountId),
        };
      }),

      createTenant: builder.createTenant
        .use(requireAuth)
        .use(requireAdmin)
        .use(requireOrganization)
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          yield* validateAccountId(input.accountId);
          const result = yield* verifyDaoMembership({
            daoAccountId: input.accountId,
            memberAccountId: context.near?.primaryAccountId ?? null,
          });
          if (!result.isMember) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", {
                message: "Your connected NEAR account is not a member of this DAO",
                data: {
                  daoAccountId: input.accountId,
                  primaryAccountId: context.near?.primaryAccountId ?? null,
                },
              }),
            );
          }
          return yield* services.tenants.createTenant({
            name: input.name,
            accountId: input.accountId,
            orgId: context.organization?.activeOrganizationId ?? null,
            status: input.status,
            ownerKind: "dao",
            allowUiOverrides: input.allowUiOverrides,
            allowBackendOverrides: input.allowBackendOverrides,
            allowSsr: input.allowSsr,
          });
        }),

      updateTenant: builder.updateTenant
        .use(requireAuth)
        .use(requireOrgRole("owner"))
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          const tenant = yield* authorizedTenant(services, input, context);
          if (input.accountId !== undefined) yield* validateAccountId(input.accountId);
          return yield* services.tenants.updateTenant(tenant.id, {
            name: input.name,
            accountId: input.accountId,
            status: input.status,
            allowUiOverrides: input.allowUiOverrides,
            allowBackendOverrides: input.allowBackendOverrides,
            allowSsr: input.allowSsr,
          });
        }),

      deleteTenant: builder.deleteTenant
        .use(requireAuth)
        .use(requireOrgRole("owner"))
        .effect(function* ({ input, context, errors }) {
          const services = yield* ApiServices;
          yield* authorizedTenant(services, input, context);
          const result = yield* services.tenants.softDeleteTenant(input.tenantId);
          if (!result) {
            return yield* Effect.fail(
              errors.NOT_FOUND({
                message: "Tenant not found",
                data: { resource: "tenant", resourceId: input.tenantId },
              }),
            );
          }
          return result;
        }),

      suspendTenant: builder.suspendTenant
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .effect(function* ({ input, context, errors }) {
          const services = yield* ApiServices;
          yield* authorizedTenant(services, input, context);
          const result = yield* services.tenants.suspendTenant(input.tenantId);
          if (!result) {
            return yield* Effect.fail(
              errors.NOT_FOUND({
                message: "Tenant not found",
                data: { resource: "tenant", resourceId: input.tenantId },
              }),
            );
          }
          return result;
        }),

      reactivateTenant: builder.reactivateTenant
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .effect(function* ({ input, context, errors }) {
          const services = yield* ApiServices;
          yield* authorizedTenant(services, input, context);
          const result = yield* services.tenants.reactivateTenant(input.tenantId);
          if (!result) {
            return yield* Effect.fail(
              errors.NOT_FOUND({
                message: "Tenant not found",
                data: { resource: "tenant", resourceId: input.tenantId },
              }),
            );
          }
          return result;
        }),

      resolveTenant: builder.resolveTenant.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const tenant = yield* services.tenants.resolveTenantByAccountId(input.accountId);
        if (!tenant) return null;
        const { ownerUserId: _ownerUserId, ...publicTenant } = tenant;
        return publicTenant;
      }),

      resolveTenantById: builder.resolveTenantById.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const tenant = yield* services.tenants.resolveTenantById(input.tenantId);
        if (!tenant) return null;
        const { ownerUserId: _ownerUserId, ...publicTenant } = tenant;
        return publicTenant;
      }),

      resolveTenantByOrgId: builder.resolveTenantByOrgId.effect(function* ({ input, errors }) {
        const services = yield* ApiServices;
        const tenant = yield* services.tenants.resolveTenantByOrgId(input.orgId);
        if (!tenant) {
          return yield* Effect.fail(
            errors.NOT_FOUND({
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: input.orgId },
            }),
          );
        }
        const { ownerUserId: _ownerUserId, ...publicTenant } = tenant;
        return publicTenant;
      }),

      listTenantBindings: builder.listTenantBindings.effect(function* () {
        const services = yield* ApiServices;
        return yield* services.tenants.listBindings;
      }),

      listTenantApps: builder.listTenantApps.effect(function* () {
        const services = yield* ApiServices;
        return yield* services.tenants.listTenantApps();
      }),

      listStakeCommunities: builder.listStakeCommunities.effect(function* ({ context }) {
        const services = yield* ApiServices;
        const activeOrganizationId = context.organization?.activeOrganizationId;
        const apps =
          !context.user || context.user.isAnonymous === true
            ? yield* services.tenants.listTenantApps()
            : yield* services.tenants.listTenantApps(
                activeOrganizationId
                  ? [activeOrganizationId]
                  : (context.organizations ?? []).map((organization) => organization.id),
              );
        const stakeable = yield* services.validators.nodeIdsWithValidators(
          apps.flatMap((app) => (app.node ? [app.node.id] : [])),
        );
        return apps.map((app) => ({
          ...app,
          stakeable: app.node ? stakeable.has(app.node.id) : false,
        }));
      }),

      listTenantBindingsForTenant: builder.listTenantBindingsForTenant
        .use(requireAuth)
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          const tenant = yield* authorizedTenant(services, input, context);
          return yield* services.tenants.listBindingsForTenant(tenant.id);
        }),

      createBinding: builder.createBinding.use(requireAuth).effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        yield* authorizedTenant(services, input, context);
        yield* validateHostname(input.hostname);
        return yield* services.tenants.createBinding({
          tenantId: input.tenantId,
          hostname: input.hostname.toLowerCase(),
          isPrimary: input.isPrimary,
        });
      }),

      verifyCustomDomain: builder.verifyCustomDomain.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        yield* authorizedTenant(services, input, context);
        return yield* services.tenants.verifyCustomDomain(input.tenantId, input.bindingId);
      }),

      deleteBinding: builder.deleteBinding.use(requireAuth).effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        yield* authorizedTenant(services, input, context);
        yield* services.tenants.deleteBinding(input.tenantId, input.bindingId);
        return { success: true as const };
      }),

      setPrimaryBinding: builder.setPrimaryBinding
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          yield* authorizedTenant(services, input, context);
          return yield* services.tenants.setPrimaryBinding(input.tenantId, input.bindingId);
        }),

      resolveBindingByHostname: builder.resolveBindingByHostname.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const binding = yield* services.tenants.resolveBindingByHostname(input.hostname);
        if (!binding) return null;
        const { verificationToken: _verificationToken, ...publicBinding } = binding;
        return publicBinding;
      }),

      bindingPreflight: builder.bindingPreflight.use(requireAuth).effect(function* ({ input }) {
        const services = yield* ApiServices;
        const format = HOSTNAME_REGEX.test(input.hostname.toLowerCase())
          ? ("valid" as const)
          : ("invalid" as const);
        const existing =
          format === "valid"
            ? yield* services.tenants.resolveBindingByHostname(input.hostname.toLowerCase())
            : null;
        return {
          hostname: { available: format === "valid" && !existing, format },
        };
      }),

      approveOfficialApplication: builder.approveOfficialApplication
        .use(requireAdmin)
        .effect(function* ({ input, context }) {
          const proposalsPlugin = plugins.proposals;
          const authPlugin = plugins.auth;
          if (!proposalsPlugin || !authPlugin) {
            return yield* Effect.fail(
              new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "The proposals or auth plugin is not available",
              }),
            );
          }
          const reviewerUserId = context.userId ?? context.user?.id ?? "";
          const reviewerContext = {
            reqHeaders: Object.fromEntries(new Headers(context.reqHeaders).entries()),
            userId: reviewerUserId,
            user: context.user,
          };
          const proposalsClient = proposalsPlugin.client(reviewerContext);
          const auth = authPlugin.client(reviewerContext);
          const services = yield* ApiServices;
          const failure = (message: string) => (error: unknown) =>
            error instanceof ORPCError
              ? error
              : new ORPCError("INTERNAL_SERVER_ERROR", { message });
          const listed = yield* Effect.tryPromise({
            try: () =>
              proposalsClient.getProposals({
                pluginId: "node",
                entityId: input.entityId,
                limit: 1,
              }),
            catch: failure("Could not load the application"),
          });
          const proposal = listed.data.find((item) => item.id === input.proposalId);
          if (!proposal) {
            return yield* Effect.fail(
              new ORPCError("NOT_FOUND", { message: "Application not found" }),
            );
          }
          if (proposal.updatedAt !== input.expectedUpdatedAt) {
            return yield* Effect.fail(
              new ORPCError("BAD_REQUEST", {
                message: "This proposal changed. Refresh and try again.",
              }),
            );
          }
          if (proposal.reviewStatus !== "pending") {
            return yield* Effect.fail(
              new ORPCError("BAD_REQUEST", { message: "This application is already decided" }),
            );
          }
          const application = yield* Effect.try({
            try: () => parseOfficialApplication(proposal.payload, proposal.entityId),
            catch: failure("Could not read the application"),
          });
          const link = yield* Effect.tryPromise({
            try: async () => {
              const community = await resolveApplicationCommunity(services, application);
              return linkOfficialDao(services, auth, {
                community,
                daoAccountId: application.accountId,
                reviewerUserId,
              });
            },
            catch: failure("Could not link the DAO to the community"),
          });
          yield* Effect.tryPromise({
            try: () =>
              proposalsClient.approve({
                pluginId: "node",
                entityId: proposal.entityId,
                expectedUpdatedAt: proposal.updatedAt,
              }),
            catch: failure("Could not approve the application"),
          });
          yield* Effect.tryPromise({
            try: () =>
              grantApplicantAdmin(auth, {
                organizationId: link.organizationId,
                applicantUserId: application.applicantUserId,
                reviewerUserId,
              }),
            catch: failure("Could not make the applicant an admin"),
          });
          return link;
        }),

      listNodes: builder.listNodes.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        const nodes = yield* services.nodes.list({
          includePlatform:
            context.user?.role === "admin" &&
            (input.kind !== undefined || input.tenantId !== undefined),
          ...(input.kind !== undefined && { kind: input.kind }),
          ...(input.parentId !== undefined && { parentId: input.parentId }),
          ...(input.tenantId !== undefined && { tenantId: input.tenantId }),
        });
        return nodes.map(nodeForViewer(context));
      }),

      listNodeSummaries: builder.listNodeSummaries.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        const summaries = yield* services.nodes.listSummaries({
          includePlatform: context.user?.role === "admin" && input.kind !== undefined,
          ...(input.scope === "roots" && { parentId: null }),
          ...(input.kind !== undefined && { kind: input.kind }),
        });
        const present = nodeForViewer(context);
        return summaries.map((summary) => ({ ...summary, node: present(summary.node) }));
      }),

      getNode: builder.getNode.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        const node = yield* services.nodes.getById(input.nodeId);
        return node && nodeForViewer(context)(node);
      }),

      updateNode: builder.updateNode
        .use(requireAuth)
        .use(requireNodeOperations)
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          const node = yield* resolveNodeForAccess(services, input.nodeId);
          yield* authorizeNodeAccess(services, node, context, {
            adminBypassOrg: true,
            resource: "node",
          });
          yield* guardNodeKind(node.kind, requestedNodeKind(input));
          return yield* services.nodes.update(input.nodeId, {
            ...(input.kind !== undefined && { kind: input.kind }),
            ...(input.metadata !== undefined && { metadata: input.metadata }),
          });
        }),

      setNodeBulletin: builder.setNodeBulletin
        .use(requireAuth)
        .use(requireNodeOperations)
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          const node = yield* resolveNodeForAccess(services, input.nodeId);
          yield* authorizeNodeAccess(services, node, context, {
            adminBypassOrg: true,
            resource: "node",
          });
          return yield* services.nodes.setBulletin(
            input.nodeId,
            input.bulletin,
            bulletinPublisherOf(context),
          );
        }),

      deleteNode: builder.deleteNode
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .use(requireNodeOperations)
        .effect(function* ({ input, context, errors }) {
          const services = yield* ApiServices;
          const node = yield* resolveNodeForAccess(services, input.nodeId);
          yield* authorizeNodeAccess(services, node, context, {
            adminBypassOrg: false,
            resource: "node",
          });
          const deleted = yield* services.nodes.delete(input.nodeId);
          if (!deleted) {
            return yield* Effect.fail(
              errors.NOT_FOUND({
                message: "Node not found",
                data: { resource: "node", resourceId: input.nodeId },
              }),
            );
          }
          return { success: true as const };
        }),

      listRootNodes: builder.listRootNodes.effect(function* ({ context }) {
        const services = yield* ApiServices;
        const nodes = yield* services.nodes.listRootNodes;
        return nodes.map(nodeForViewer(context));
      }),

      listChildren: builder.listChildren.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        const nodes = yield* services.nodes.listChildren(input.nodeId);
        return nodes.map(nodeForViewer(context));
      }),

      listNodeAncestors: builder.listNodeAncestors.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        yield* resolveNodeForAccess(services, input.nodeId);
        const ancestors = yield* services.nodes.listAncestors(input.nodeId);
        return ancestors.map(nodeForViewer(context));
      }),

      getSubtree: builder.getSubtree.effect(function* ({ input, errors }) {
        const services = yield* ApiServices;
        const subtree = yield* services.nodes.subtreeWithValidators(input.nodeId);
        if (subtree.length === 0) {
          return yield* Effect.fail(
            errors.NOT_FOUND({
              message: "Node not found",
              data: { resource: "node", resourceId: input.nodeId },
            }),
          );
        }
        return subtree;
      }),

      getNodeSummary: builder.getNodeSummary.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        const node = yield* resolveNodeForAccess(services, input.nodeId);

        const [children, subtree, validators] = yield* Effect.all([
          services.nodes.listChildren(input.nodeId),
          services.nodes.subtreeWithValidators(input.nodeId),
          services.validators.listByNode(input.nodeId),
        ]);
        const subtreeValidators = subtree.flatMap((entry) => entry.validators);
        const subtreeValidatorCountsByRole = { official: 0, community: 0 };
        for (const validator of subtreeValidators) {
          if (validator.role === "official") {
            subtreeValidatorCountsByRole.official += 1;
          } else if (validator.role === "community") {
            subtreeValidatorCountsByRole.community += 1;
          }
        }

        return {
          node: nodeForViewer(context)(node),
          childrenCount: children.length,
          subtreeNodeCount: subtree.length,
          validators,
          subtreeValidatorCount: subtreeValidators.length,
          subtreeValidatorCountsByRole,
          children: children.map(({ id, kind, slug, name }) => ({
            id,
            kind,
            slug,
            name,
          })),
        };
      }),

      resolveNodeBySlug: builder.resolveNodeBySlug.effect(function* ({ input, context }) {
        const services = yield* ApiServices;
        const node = yield* services.nodes.resolveBySlug(input.slug);
        return node && nodeForViewer(context)(node);
      }),

      resolvePlace: builder.resolvePlace.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.places.resolve(input);
      }),

      listRootPlaces: builder.listRootPlaces.effect(function* () {
        const services = yield* ApiServices;
        return yield* services.places.roots();
      }),

      getPlace: builder.getPlace.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.places.getById(input.placeId);
      }),

      listPlaceChildren: builder.listPlaceChildren.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.places.children(input.placeId);
      }),

      getPlaceBoundary: builder.getPlaceBoundary.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.places.boundary(input.placeId);
      }),

      listPlaceBoundaries: builder.listPlaceBoundaries.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.places.boundaries(input.placeIds);
      }),

      listPlaceMapPins: builder.listPlaceMapPins.effect(function* () {
        const services = yield* ApiServices;
        return yield* services.places.mapPins();
      }),

      activateCommunity: builder.activateCommunity.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const services = yield* ApiServices;
        const userId = context.userId ?? context.user?.id;
        if (!userId) {
          return yield* Effect.fail(
            new ORPCError("UNAUTHORIZED", { message: "Authentication required" }),
          );
        }
        const auth = yield* memberAuthClient({
          reqHeaders: context.reqHeaders,
          userId,
          user: context.user,
        });
        return yield* Effect.tryPromise({
          try: () =>
            activateCommunity({ places: services.places, nodes: services.nodes }, auth, {
              place: input.place,
              userId,
            }),
          catch: (error) =>
            error instanceof ORPCError
              ? error
              : new ORPCError("INTERNAL_SERVER_ERROR", {
                  message: error instanceof Error ? error.message : "Activation failed",
                }),
        });
      }),

      joinCommunity: builder.joinCommunity.use(requireAuth).effect(function* ({
        input,
        context,
        errors,
      }) {
        const services = yield* ApiServices;
        const node = yield* services.nodes.getByPlace(input.placeId);
        if (!node) {
          return yield* Effect.fail(
            errors.NOT_FOUND({
              message: "This place has no community yet",
              data: { resource: "place", resourceId: input.placeId },
            }),
          );
        }
        const joinCodeId = (node.metadata as { joinCodeId?: string } | null)?.joinCodeId;
        if (!joinCodeId) {
          return yield* Effect.fail(
            errors.CONFLICT({
              message: "This community is missing its join code",
              data: {},
            }),
          );
        }
        const authPlugin = plugins.auth;
        if (!authPlugin) {
          return yield* Effect.fail(
            new ORPCError("INTERNAL_SERVER_ERROR", { message: "The auth plugin is not available" }),
          );
        }
        const userId = context.userId ?? context.user?.id;
        if (!userId) {
          return yield* Effect.fail(
            new ORPCError("UNAUTHORIZED", { message: "Authentication required" }),
          );
        }
        const auth = authPlugin.client({
          reqHeaders: Object.fromEntries(new Headers(context.reqHeaders).entries()),
          userId,
          user: context.user,
          session: context.session,
        });
        const joinOutcome = yield* Effect.tryPromise({
          try: async () => {
            try {
              const redeemed = await auth.redeemOnboardingCode({ code: joinCodeId });
              return {
                joined: true as const,
                alreadyMember: false,
                organizationId: redeemed.organizationId as string,
              };
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : String(cause);
              if (/already/i.test(message)) {
                return {
                  joined: true as const,
                  alreadyMember: true,
                  organizationId: node.orgId ?? "",
                };
              }
              throw cause;
            }
          },
          catch: (cause) =>
            new ORPCError("CONFLICT", {
              message: "Could not join this community",
              data: { cause: cause instanceof Error ? cause.message : String(cause) },
            }),
        });
        if (joinOutcome.alreadyMember) {
          return {
            organizationId: joinOutcome.organizationId,
            nodeId: node.id,
            slug: node.slug,
            alreadyMember: true,
          };
        }
        return {
          organizationId: joinOutcome.organizationId,
          nodeId: node.id,
          slug: node.slug,
          alreadyMember: false,
        };
      }),

      listValidators: builder.listValidators.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.validators.list({
          ...(input.nodeId !== undefined && { nodeId: input.nodeId }),
          ...(input.role !== undefined && { role: input.role }),
        });
      }),

      listValidatorsByNode: builder.listValidatorsByNode.effect(function* ({ input }) {
        const services = yield* ApiServices;
        return yield* services.validators.listByNode(input.nodeId);
      }),

      getValidator: builder.getValidator.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const validator = yield* services.validators.getById(input.validatorId);
        return validator ?? null;
      }),

      resolveValidatorByAccountId: builder.resolveValidatorByAccountId.effect(function* ({
        input,
      }) {
        const services = yield* ApiServices;
        const validator = yield* services.validators.resolveByAccountId(input.accountId);
        return validator ?? null;
      }),

      getStakingPoolApproval: builder.getStakingPoolApproval.effect(function* ({ input }) {
        const services = yield* ApiServices;
        const approved = yield* checkStakingPool(
          services.stakingPools,
          input.accountId,
          input.network,
        );
        return { approved };
      }),

      createValidator: builder.createValidator
        .use(requireAuth)
        .use(requireNodeOperations)
        .effect(function* ({ input, context }) {
          const services = yield* ApiServices;
          yield* authorizedNodeForValidators(services, input.nodeId, context);
          yield* requireApprovedStakingPool(services.stakingPools, input);
          return yield* services.validators.create({
            nodeId: input.nodeId,
            accountId: input.accountId,
            network: input.network,
            protocol: input.protocol,
            role: input.role,
            isDefault: input.isDefault,
            ...(input.metadata !== undefined && { metadata: input.metadata }),
          });
        }),

      updateValidator: builder.updateValidator
        .use(requireAuth)
        .use(requireNodeOperations)
        .effect(function* ({ input, context, errors }) {
          const services = yield* ApiServices;
          const validator = yield* services.validators.getById(input.validatorId);
          if (!validator) {
            return yield* Effect.fail(
              errors.NOT_FOUND({
                message: "Validator not found",
                data: { resource: "validator", resourceId: input.validatorId },
              }),
            );
          }
          yield* authorizedNodeForValidators(services, validator.nodeId, context);
          const next = {
            accountId: input.accountId ?? validator.accountId,
            network: input.network ?? validator.network,
            protocol: input.protocol ?? validator.protocol,
          };
          if (
            next.accountId !== validator.accountId ||
            next.network !== validator.network ||
            next.protocol !== validator.protocol ||
            (input.isDefault === true && !validator.isDefault)
          ) {
            yield* requireApprovedStakingPool(services.stakingPools, next);
          }
          return yield* services.validators.update(input.validatorId, {
            ...(input.accountId !== undefined && {
              accountId: input.accountId,
            }),
            ...(input.network !== undefined && { network: input.network }),
            ...(input.protocol !== undefined && { protocol: input.protocol }),
            ...(input.role !== undefined && { role: input.role }),
            ...(input.isDefault !== undefined && {
              isDefault: input.isDefault,
            }),
            ...(input.metadata !== undefined && { metadata: input.metadata }),
          });
        }),

      deleteValidator: builder.deleteValidator
        .use(requireAuth)
        .use(requireNodeOperations)
        .effect(function* ({ input, context, errors }) {
          const services = yield* ApiServices;
          const validator = yield* services.validators.getById(input.validatorId);
          if (!validator) {
            return yield* Effect.fail(
              errors.NOT_FOUND({
                message: "Validator not found",
                data: { resource: "validator", resourceId: input.validatorId },
              }),
            );
          }
          yield* authorizedNodeForValidators(services, validator.nodeId, context);
          const ok = yield* services.validators.delete(input.validatorId);
          return { success: ok as true };
        }),

      setDefaultValidator: builder.setDefaultValidator
        .use(requireAuth)
        .use(requireNodeOperations)
        .effect(function* ({ input, context, errors }) {
          const services = yield* ApiServices;
          const target = yield* services.validators.getById(input.validatorId);
          if (!target) {
            return yield* Effect.fail(
              errors.NOT_FOUND({
                message: "Validator not found",
                data: { resource: "validator", resourceId: input.validatorId },
              }),
            );
          }
          yield* authorizedNodeForValidators(services, target.nodeId, context);
          yield* requireApprovedStakingPool(services.stakingPools, target);
          return yield* services.validators.setDefault(target.nodeId, input.validatorId);
        }),

      testError: builder.testError.handler(async ({ input }) => {
        switch (input.kind) {
          case "unauthorized":
            throw new ORPCError("UNAUTHORIZED", {
              message: "test unauthorized error",
            });
          case "forbidden":
            throw new ORPCError("FORBIDDEN", {
              message: "test forbidden error",
            });
          case "not_found":
            throw new ORPCError("NOT_FOUND", {
              message: "test not found error",
            });
          case "conflict":
            throw new ORPCError("CONFLICT", { message: "test conflict error" });
          case "bad_request":
            throw new ORPCError("BAD_REQUEST", {
              message: "test bad request error",
            });
          default:
            throw new Error("test internal server error");
        }
      }),

      uploadStorageBundle: builder.uploadStorageBundle.effect(function* ({
        input,
        context,
        errors,
      }) {
        const services = yield* ApiServices;

        if (!context.user && !context.userId && !context.apiKey) {
          return yield* Effect.fail(
            errors.UNAUTHORIZED({
              message: "Authentication required — sign in or provide an API key",
              data: { apiKeyProvided: Boolean(context.apiKey) },
            }),
          );
        }

        const invalidFields = [
          !validateNamespacePart(input.account, "account") ? "account" : null,
          !validateNamespacePart(input.gateway, "gateway") ? "gateway" : null,
          !validateNamespacePart(input.workspace, "workspace") ? "workspace" : null,
        ].filter((field): field is string => field !== null);
        if (invalidFields.length > 0) {
          return yield* Effect.fail(
            errors.BAD_REQUEST({
              message: "Invalid bundle namespace",
              data: { invalidFields },
            }),
          );
        }

        const principal = context.near?.primaryAccountId ?? null;
        const isSession = Boolean(context.user || context.userId);
        if (isSession && !principal) {
          return yield* Effect.fail(
            errors.FORBIDDEN({
              message: "Link a NEAR account to your session to publish bundles",
              data: { action: "storage.bundles.write" },
            }),
          );
        }
        if (principal && principal !== input.account) {
          return yield* Effect.fail(
            errors.FORBIDDEN({
              message: `Bundle uploads are pinned to the authenticated account (${principal})`,
              data: { action: "storage.bundles.write" },
            }),
          );
        }

        const maxBytes = maxBundleUploadBytes();
        const measured: Array<{ objectPath: string; name: string; encoded: string }> = [];
        const sizes: number[] = [];
        for (const file of input.files) {
          const objectPath = validateObjectPath(file.path);
          if (!objectPath) {
            return yield* Effect.fail(
              errors.BAD_REQUEST({
                message: `Invalid bundle object path: ${file.path}`,
                data: { invalidFields: ["files"] },
              }),
            );
          }
          const size = measureBase64(file.contentBase64);
          if (size === null) {
            return yield* Effect.fail(
              errors.BAD_REQUEST({
                message: `Invalid base64 content: ${file.path}`,
                data: { invalidFields: ["files"] },
              }),
            );
          }
          if (size === 0) {
            return yield* Effect.fail(
              errors.BAD_REQUEST({
                message: `Empty bundle file: ${file.path}`,
                data: { invalidFields: ["files"] },
              }),
            );
          }
          sizes.push(size);
          measured.push({
            objectPath,
            name: objectPath.split("/").pop() ?? objectPath,
            encoded: file.contentBase64,
          });
        }

        const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
        if (!validateUploadSize(sizes, maxBytes)) {
          return yield* Effect.fail(
            errors.BAD_REQUEST({
              message: `Bundle upload exceeds the ${maxBytes} byte ceiling (${totalBytes})`,
              data: { invalidFields: ["files"] },
            }),
          );
        }

        const decoded = measured.map(({ encoded, ...file }) => ({
          ...file,
          bytes: new Uint8Array(Buffer.from(encoded, "base64")),
        }));

        // Bounded pool: 736 sequential PUTs are minutes of pure round-trip
        // latency; 4-way concurrency cuts wall time ~4x with no extra memory
        // (all file bytes are already decoded in memory).
        const putFile = (file: (typeof decoded)[number]) =>
          Effect.gen(function* () {
            // Exit + squash: the storage layer's put is typed never-error
            // (Effect.promise rejections are defects) — this catches both
            // defects and typed failures so the cause reaches the client
            // as a CONNECTION_ERROR instead of a bare INTERNAL_SERVER_ERROR.
            const put = yield* Effect.exit(
              services.storage.put({
                key: buildBundleKey(input.account, input.gateway, input.workspace, file.objectPath),
                bytes: file.bytes,
                contentType: bundleContentType(file.name),
                cacheControl: bundleCacheControl(file.name),
              }),
            );
            if (Exit.isFailure(put)) {
              const cause = Cause.squash(put.cause);
              return yield* Effect.fail(
                errors.CONNECTION_ERROR({
                  message: `Bundle storage failed for ${file.objectPath}: ${
                    cause instanceof Error ? cause.message : String(cause)
                  }`,
                  data: {
                    errorCode: "STORAGE_PUT_FAILED",
                    suggestion:
                      "Check BOS_STORAGE_* (R2/MinIO) credentials and reachability on the API host",
                  },
                }),
              );
            }
            return [file.objectPath, computeObjectIntegrity(file.bytes)] as const;
          });
        const { assets, entries } = partitionBundleFiles(decoded);
        const integrityEntries = [
          ...(yield* Effect.forEach(assets, putFile, { concurrency: 4 })),
          ...(yield* Effect.forEach(entries, putFile, { concurrency: 4 })),
        ];
        const integrity = Object.fromEntries(integrityEntries);

        return { stored: decoded.length, totalBytes, integrity, storage: services.storage.backend };
      }),
    };

    return router as ContractedRouter<typeof contract, any>;
  },
});
