import type { ContractedRouter } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { Context, Effect, Layer } from "effect";
import { createPlugin } from "every-plugin";
import { suppressPgQueryQueueDeprecation } from "everything-dev/db";
import { z } from "zod";
import { contract } from "./contract";
import { DatabaseLive } from "./db/layer";
import { createAuthMiddleware } from "./lib/auth";
import { ContextSchema } from "./lib/context";
import type { PluginsClient } from "./lib/plugins-types.gen";
import { verifyDaoMembership } from "./services/dao";
import type { DiscoveryService } from "./services/discovery";
import { DiscoveryLive, DiscoveryTag } from "./services/discovery";
import type { NodesService } from "./services/nodes";
import { NodesLive, NodesTag } from "./services/nodes";
import type { TenantsService } from "./services/tenants";
import { TenantsLive, TenantsTag } from "./services/tenants";
import type { ValidatorsService } from "./services/validators";
import { ValidatorsLive, ValidatorsTag } from "./services/validators";

class ApiServices extends Context.Service<
  ApiServices,
  {
    tenants: TenantsService;
    nodes: NodesService;
    validators: ValidatorsService;
    discovery: DiscoveryService;
  }
>()("api/ApiServices") {}

const ACCOUNT_ID_REGEX =
  /^(?=.{2,64}$)([a-z0-9]+(?:[-_][a-z0-9]+)*)(\.([a-z0-9]+(?:[-_][a-z0-9]+)*))*$/;

suppressPgQueryQueueDeprecation();

const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?=.{1,64}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$/;

function validateAccountId(accountId: string): void {
  if (!ACCOUNT_ID_REGEX.test(accountId)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Invalid accountId format",
      data: { hint: "Must be a valid NEAR account ID" },
    });
  }
}

function validateHostname(hostname: string): void {
  const normalized = hostname.toLowerCase();
  if (!HOSTNAME_REGEX.test(normalized)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Invalid hostname format",
      data: { hint: "Must be a valid DNS hostname" },
    });
  }
}

export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({
    platformAccount: z.string().optional(),
  }),

  secrets: z.object({
    LUMA_CALENDAR_API_KEYS: z.string().default(""),
    API_DATABASE_URL: z.string().default("pglite:.bos/api/:memory:"),
  }),

  context: ContextSchema,

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const database = DatabaseLive(config.secrets.API_DATABASE_URL);
      const services = yield* Layer.buildWithScope(
        Layer.mergeAll(
          TenantsLive,
          NodesLive,
          ValidatorsLive,
          DiscoveryLive(config.secrets.LUMA_CALENDAR_API_KEYS),
        ).pipe(Layer.provide(database)),
        yield* Effect.scope,
      );

      console.log("[API] Services Initialized");

      return Layer.succeed(ApiServices, {
        tenants: Context.get(services, TenantsTag),
        nodes: Context.get(services, NodesTag),
        validators: Context.get(services, ValidatorsTag),
        discovery: Context.get(services, DiscoveryTag),
      });
    }),

  createRouter: (builder, plugins) => {
    const { requireAuth, requireAdmin, requireOrganization, requireOrgRole } =
      createAuthMiddleware(builder);

    const authorizedTenant = async (
      input: { tenantId: string },
      context: {
        user?: { role?: string | null };
        organization?: { activeOrganizationId: string | null };
        near?: { primaryAccountId: string | null };
      },
    ) => {
      const services = Context.get((context as any)["effect/context"], ApiServices);
      const tenant = await services.tenants.resolveTenantById(input.tenantId);
      if (!tenant) {
        throw new ORPCError("NOT_FOUND", {
          message: "Tenant not found",
          data: { resource: "tenant", resourceId: input.tenantId },
        });
      }
      if (context.user?.role === "admin") return tenant;
      if (tenant.orgId === null) {
        const isOwner =
          !!context.near?.primaryAccountId && context.near.primaryAccountId === tenant.accountId;
        if (!isOwner) {
          throw new ORPCError("FORBIDDEN", {
            message: "You do not own this personal tenant",
          });
        }
        return tenant;
      }
      const activeOrgId = context.organization?.activeOrganizationId;
      if (!activeOrgId || tenant.orgId !== activeOrgId) {
        throw new ORPCError("FORBIDDEN", {
          message: "You are not a member of this tenant's organization",
        });
      }
      return tenant;
    };

    const authorizedNodeForValidators = async (
      nodeId: string,
      context: {
        user?: { role?: string | null };
        organization?: { activeOrganizationId: string | null };
      },
    ) => {
      const services = Context.get((context as any)["effect/context"], ApiServices);
      const node = await services.nodes.getById(nodeId);
      if (!node) {
        throw new ORPCError("NOT_FOUND", {
          message: "Node not found",
          data: { resource: "node", resourceId: nodeId },
        });
      }
      const tenant = await services.tenants.resolveTenantById(node.tenantId);
      if (!tenant) {
        throw new ORPCError("NOT_FOUND", {
          message: "Tenant not found",
          data: { resource: "tenant", resourceId: node.tenantId },
        });
      }
      if (
        context.user?.role !== "admin" &&
        (!context.organization?.activeOrganizationId ||
          tenant.orgId !== context.organization.activeOrganizationId)
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "This node's validators do not belong to your organization",
        });
      }
      return node;
    };

    const router = {
      trackDiscovery: builder.trackDiscovery.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.track(input, context),
      ),
      getDiscoveryMetrics: builder.getDiscoveryMetrics.handler(async ({ context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.metrics(context),
      ),
      getDiscoveryStudio: builder.getDiscoveryStudio.handler(async ({ context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.studio(context),
      ),
      setDiscoveryCurator: builder.setDiscoveryCurator.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.setCurator(input, context),
      ),
      featureDiscoveryNode: builder.featureDiscoveryNode.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.feature(input, context),
      ),
      reportDiscoveryContent: builder.reportDiscoveryContent.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.report(input),
      ),
      moderateDiscoveryReport: builder.moderateDiscoveryReport.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.moderate(input, context),
      ),
      getDiscoveryHistory: builder.getDiscoveryHistory.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.history(
          input.nodeId,
          context,
        ),
      ),
      listDiscoveryLumaCalendars: builder.listDiscoveryLumaCalendars.handler(
        async ({ input, context }) =>
          Context.get(context["effect/context"], ApiServices).discovery.lumaCalendars(
            input.nodeId,
            context,
          ),
      ),
      disconnectDiscoveryLuma: builder.disconnectDiscoveryLuma.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.disconnectLuma(
          input.nodeId,
          context,
        ),
      ),
      importDiscoveryLuma: builder.importDiscoveryLuma.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.importLuma(input, context),
      ),
      saveDiscoveryActivity: builder.saveDiscoveryActivity.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.saveActivity(input, context),
      ),
      listDiscoveryActivities: builder.listDiscoveryActivities.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.activities(
          input.nodeId,
          context,
        ),
      ),
      getDiscoveryActivity: builder.getDiscoveryActivity.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.activity(input.id),
      ),
      listDiscovery: builder.listDiscovery.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.list(input),
      ),
      getDiscoveryNode: builder.getDiscoveryNode.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.get(input.nodeId),
      ),
      getDiscoveryProfile: builder.getDiscoveryProfile.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.profile(
          input.nodeId,
          context,
        ),
      ),
      saveDiscoveryProfile: builder.saveDiscoveryProfile.handler(async ({ input, context }) =>
        Context.get(context["effect/context"], ApiServices).discovery.saveProfile(input, context),
      ),
      ping: builder.ping.handler(async () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
      })),

      listTenants: builder.listTenants.use(requireAuth).handler(async ({ context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        if (context.user.role === "admin") return services.tenants.listAllTenants();
        const orgId = context.organization?.activeOrganizationId;
        if (!orgId) {
          throw new ORPCError("FORBIDDEN", {
            message: "Active organization required",
          });
        }
        return services.tenants.listTenantsByOrgIds([orgId]);
      }),

      createTenant: builder.createTenant
        .use(requireAuth)
        .use(requireAdmin)
        .use(requireOrganization)
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          validateAccountId(input.accountId);
          const result = await verifyDaoMembership({
            daoAccountId: input.accountId,
            memberAccountId: context.near?.primaryAccountId ?? null,
          });
          if (!result.isMember) {
            throw new ORPCError("FORBIDDEN", {
              message: "Your connected NEAR account is not a member of this DAO",
              data: {
                daoAccountId: input.accountId,
                primaryAccountId: context.near?.primaryAccountId ?? null,
              },
            });
          }
          return await services.tenants.createTenant({
            name: input.name,
            accountId: input.accountId,
            orgId: context.organization.activeOrganizationId,
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
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const tenant = await authorizedTenant(input, context);
          if (input.accountId !== undefined) validateAccountId(input.accountId);
          return await services.tenants.updateTenant(tenant.id, {
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
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          await authorizedTenant(input, context);
          const result = await services.tenants.softDeleteTenant(input.tenantId);
          if (!result) {
            throw new ORPCError("NOT_FOUND", {
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: input.tenantId },
            });
          }
          return result;
        }),

      suspendTenant: builder.suspendTenant
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          await authorizedTenant(input, context);
          const result = await services.tenants.suspendTenant(input.tenantId);
          if (!result) {
            throw new ORPCError("NOT_FOUND", {
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: input.tenantId },
            });
          }
          return result;
        }),

      reactivateTenant: builder.reactivateTenant
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          await authorizedTenant(input, context);
          const result = await services.tenants.reactivateTenant(input.tenantId);
          if (!result) {
            throw new ORPCError("NOT_FOUND", {
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: input.tenantId },
            });
          }
          return result;
        }),

      resolveTenant: builder.resolveTenant.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        const tenant = await services.tenants.resolveTenantByAccountId(input.accountId);
        return tenant ?? null;
      }),

      resolveTenantByOrgId: builder.resolveTenantByOrgId.handler(
        async ({ input, errors, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const tenant = await services.tenants.resolveTenantByOrgId(input.orgId);
          if (!tenant) {
            throw errors.NOT_FOUND({
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: input.orgId },
            });
          }
          return tenant;
        },
      ),

      listTenantBindings: builder.listTenantBindings.handler(async ({ context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        return services.tenants.listBindings();
      }),

      listTenantApps: builder.listTenantApps.handler(async ({ context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        return services.tenants.listTenantApps();
      }),

      listTenantBindingsForTenant: builder.listTenantBindingsForTenant
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          return services.tenants.listBindingsForTenant(input.tenantId);
        }),

      createBinding: builder.createBinding.use(requireAuth).handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        await authorizedTenant(input, context);
        validateHostname(input.hostname);
        return await services.tenants.createBinding({
          tenantId: input.tenantId,
          hostname: input.hostname.toLowerCase(),
          isPrimary: input.isPrimary,
        });
      }),

      verifyCustomDomain: builder.verifyCustomDomain
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          await authorizedTenant(input, context);
          return await services.tenants.verifyCustomDomain(input.tenantId, input.bindingId);
        }),

      deleteBinding: builder.deleteBinding.use(requireAuth).handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        await authorizedTenant(input, context);
        await services.tenants.deleteBinding(input.tenantId, input.bindingId);
        return { success: true as const };
      }),

      setPrimaryBinding: builder.setPrimaryBinding
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          await authorizedTenant(input, context);
          return await services.tenants.setPrimaryBinding(input.tenantId, input.bindingId);
        }),

      resolveBindingByHostname: builder.resolveBindingByHostname.handler(
        async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const binding = await services.tenants.resolveBindingByHostname(input.hostname);
          return binding ?? null;
        },
      ),

      bindingPreflight: builder.bindingPreflight
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const format = HOSTNAME_REGEX.test(input.hostname.toLowerCase())
            ? ("valid" as const)
            : ("invalid" as const);
          const existing =
            format === "valid"
              ? await services.tenants.resolveBindingByHostname(input.hostname.toLowerCase())
              : null;
          return {
            hostname: { available: format === "valid" && !existing, format },
          };
        }),

      applyNodeProposal: builder.applyNodeProposal
        .use(requireAdmin)
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          validateAccountId(input.accountId);
          validateAccountId(input.submitterAccountId);
          if (input.poolAccountId) validateAccountId(input.poolAccountId);
          validateHostname(input.hostname);
          const result = await verifyDaoMembership({
            daoAccountId: input.accountId,
            memberAccountId: input.submitterAccountId,
          });
          if (!result.isMember) {
            throw new ORPCError("FORBIDDEN", {
              message: `${input.submitterAccountId} is not a member of ${input.accountId} — add it under the DAO's members at https://trezu.app/${input.accountId}/members`,
              data: {
                daoAccountId: input.accountId,
                submitterAccountId: input.submitterAccountId,
              },
            });
          }
          return services.tenants.applyNodeProposal({
            kind: input.kind,
            name: input.name,
            slug: input.slug,
            parentId: input.parentId,
            orgId: input.orgId,
            accountId: input.accountId,
            hostname: input.hostname.toLowerCase(),
            ...(input.poolAccountId ? { poolAccountId: input.poolAccountId } : {}),
          });
        }),

      listNodes: builder.listNodes.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        return services.nodes.list({
          ...(input.kind !== undefined && { kind: input.kind }),
          ...(input.parentId !== undefined && { parentId: input.parentId }),
          ...(input.tenantId !== undefined && { tenantId: input.tenantId }),
        });
      }),

      listNodeSummaries: builder.listNodeSummaries.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        return services.nodes.listSummaries({
          ...(input.scope === "roots" && { parentId: null }),
          ...(input.kind !== undefined && { kind: input.kind }),
        });
      }),

      getNode: builder.getNode.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        const node = await services.nodes.getById(input.nodeId);
        return node ?? null;
      }),

      createNode: builder.createNode
        .use(requireAuth)
        .use(requireOrganization)
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const tenant = await services.tenants.resolveTenantById(input.tenantId);
          if (!tenant) {
            throw new ORPCError("NOT_FOUND", {
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: input.tenantId },
            });
          }
          if (tenant.orgId !== context.organization.activeOrganizationId) {
            throw new ORPCError("FORBIDDEN", {
              message: "This tenant does not belong to your organization",
            });
          }
          return await services.nodes.create({
            kind: input.kind,
            slug: input.slug,
            name: input.name,
            parentId: input.parentId ?? null,
            tenantId: input.tenantId,
            ...(input.metadata !== undefined && { metadata: input.metadata }),
          });
        }),

      updateNode: builder.updateNode.use(requireAuth).handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        const node = await services.nodes.getById(input.nodeId);
        if (!node) {
          throw new ORPCError("NOT_FOUND", {
            message: "Node not found",
            data: { resource: "node", resourceId: input.nodeId },
          });
        }
        const tenant = await services.tenants.resolveTenantById(node.tenantId);
        if (!tenant) {
          throw new ORPCError("NOT_FOUND", {
            message: "Tenant not found",
            data: { resource: "tenant", resourceId: node.tenantId },
          });
        }
        if (
          context.user.role !== "admin" &&
          (!context.organization?.activeOrganizationId ||
            tenant.orgId !== context.organization.activeOrganizationId)
        ) {
          throw new ORPCError("FORBIDDEN", {
            message: "This node does not belong to your organization",
          });
        }
        return await services.nodes.update(input.nodeId, {
          ...(input.kind !== undefined && { kind: input.kind }),
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.parentId !== undefined && { parentId: input.parentId }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
        });
      }),

      deleteNode: builder.deleteNode
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const node = await services.nodes.getById(input.nodeId);
          if (!node) {
            throw new ORPCError("NOT_FOUND", {
              message: "Node not found",
              data: { resource: "node", resourceId: input.nodeId },
            });
          }
          const tenant = await services.tenants.resolveTenantById(node.tenantId);
          if (!tenant) {
            throw new ORPCError("NOT_FOUND", {
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: node.tenantId },
            });
          }
          if (tenant.orgId !== context.organization.activeOrganizationId) {
            throw new ORPCError("FORBIDDEN", {
              message: "This node does not belong to your organization",
            });
          }
          const deleted = await services.nodes.delete(input.nodeId);
          if (!deleted) {
            throw new ORPCError("NOT_FOUND", {
              message: "Node not found",
              data: { resource: "node", resourceId: input.nodeId },
            });
          }
          return { success: true as const };
        }),

      listRootNodes: builder.listRootNodes.handler(async ({ context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        return services.nodes.listRootNodes();
      }),

      listChildren: builder.listChildren.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        return services.nodes.listChildren(input.nodeId);
      }),

      getSubtree: builder.getSubtree.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        const subtree = await services.nodes.subtreeWithValidators(input.nodeId);
        if (subtree.length === 0) {
          throw new ORPCError("NOT_FOUND", {
            message: "Node not found",
            data: { resource: "node", resourceId: input.nodeId },
          });
        }
        return subtree;
      }),

      getNodeSummary: builder.getNodeSummary.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        const node = await services.nodes.getById(input.nodeId);
        if (!node) {
          throw new ORPCError("NOT_FOUND", {
            message: "Node not found",
            data: { resource: "node", resourceId: input.nodeId },
          });
        }

        const [children, subtree, validators, stakingValidators] = await Promise.all([
          services.nodes.listChildren(input.nodeId),
          services.nodes.subtreeWithValidators(input.nodeId),
          services.validators.listByNode(input.nodeId),
          services.validators.resolveForStaking(input.nodeId),
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
          node,
          childrenCount: children.length,
          subtreeNodeCount: subtree.length,
          validators,
          subtreeValidatorCount: subtreeValidators.length,
          subtreeValidatorCountsByRole,
          stakingValidators,
          children: children.map(({ id, kind, slug, name }) => ({
            id,
            kind,
            slug,
            name,
          })),
        };
      }),

      resolveNodeBySlug: builder.resolveNodeBySlug.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        const node = await services.nodes.resolveBySlug(
          input.slug,
          input.parentId === undefined ? undefined : input.parentId,
        );
        return node ?? null;
      }),

      listValidators: builder.listValidators.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        return services.validators.list({
          ...(input.nodeId !== undefined && { nodeId: input.nodeId }),
          ...(input.role !== undefined && { role: input.role }),
        });
      }),

      listValidatorsByNode: builder.listValidatorsByNode.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        return services.validators.listByNode(input.nodeId);
      }),

      getValidator: builder.getValidator.handler(async ({ input, context }) => {
        const services = Context.get(context["effect/context"], ApiServices);
        const validator = await services.validators.getById(input.validatorId);
        return validator ?? null;
      }),

      resolveValidatorByAccountId: builder.resolveValidatorByAccountId.handler(
        async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const validator = await services.validators.resolveByAccountId(input.accountId);
          return validator ?? null;
        },
      ),

      resolveStakingValidators: builder.resolveStakingValidators.handler(
        async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          return services.validators.resolveForStaking(input.nodeId);
        },
      ),

      createValidator: builder.createValidator
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          await authorizedNodeForValidators(input.nodeId, context);
          return services.validators.create({
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
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const validator = await services.validators.getById(input.validatorId);
          if (!validator) {
            throw new ORPCError("NOT_FOUND", {
              message: "Validator not found",
              data: { resource: "validator", resourceId: input.validatorId },
            });
          }
          await authorizedNodeForValidators(validator.nodeId, context);
          return services.validators.update(input.validatorId, {
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
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const validator = await services.validators.getById(input.validatorId);
          if (!validator) {
            throw new ORPCError("NOT_FOUND", {
              message: "Validator not found",
              data: { resource: "validator", resourceId: input.validatorId },
            });
          }
          await authorizedNodeForValidators(validator.nodeId, context);
          const ok = await services.validators.delete(input.validatorId);
          return { success: ok as true };
        }),

      setDefaultValidator: builder.setDefaultValidator
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const services = Context.get(context["effect/context"], ApiServices);
          const target = await services.validators.getById(input.validatorId);
          if (!target) {
            throw new ORPCError("NOT_FOUND", {
              message: "Validator not found",
              data: { resource: "validator", resourceId: input.validatorId },
            });
          }
          await authorizedNodeForValidators(target.nodeId, context);
          return await services.validators.setDefault(target.nodeId, input.validatorId);
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
    };

    const templateRouter = (plugins as Record<string, { router?: unknown }>).template?.router;
    if (templateRouter) {
      (router as Record<string, unknown>).things = templateRouter;
    }

    return router as ContractedRouter<typeof contract, any>;
  },
});
