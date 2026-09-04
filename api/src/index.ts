import { createPlugin } from "every-plugin";
import { Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { suppressPgQueryQueueDeprecation } from "everything-dev/db";
import { contract } from "./contract";
import { DatabaseLive } from "./db/layer";
import { createAuthMiddleware } from "./lib/auth";
import { ContextSchema } from "./lib/context";
import type { PluginsClient } from "./lib/plugins-types.gen";
import { isExplicitDaoMember, verifyDaoMembership } from "./services/dao";
import { NodesLive, NodesTag } from "./services/nodes";
import { TenantsLive, TenantsTag } from "./services/tenants";
import { ValidatorsLive, ValidatorsTag } from "./services/validators";

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
    API_DATABASE_URL: z.string().default("pglite:.bos/api/:memory:"),
  }),

  context: ContextSchema,

  contract,

  initialize: (config, plugins, tools) =>
    Effect.gen(function* () {
      const database = DatabaseLive(config.secrets.API_DATABASE_URL);
      const tenantsLayer = TenantsLive.pipe(Layer.provide(database));
      const nodesLayer = NodesLive.pipe(Layer.provide(database));
      const validatorsLayer = ValidatorsLive.pipe(Layer.provide(database));

      const tenantsService = yield* tools.buildService(TenantsTag, tenantsLayer);
      const nodesService = yield* tools.buildService(NodesTag, nodesLayer);
      const validatorsService = yield* tools.buildService(ValidatorsTag, validatorsLayer);

      const templateFactory = (plugins as Record<string, unknown>).template as
        | (() => {
            createThing: (input: { thingId: string; payload: unknown }) => Promise<{
              thingId: string;
              type: string;
              payload: unknown;
              createdAt: string;
              updatedAt: string;
              action: string;
            }>;
            getThing: (input: { thingId: string }) => Promise<{
              thingId: string;
              type: string;
              payload: unknown;
              createdAt: string;
              updatedAt: string;
            }>;
            listThings: (input: { type?: string; limit: number; cursor?: string }) => Promise<{
              data: Array<{
                thingId: string;
                type: string;
                payload: unknown;
                createdAt: string;
                updatedAt: string;
              }>;
              meta: { total: number; hasMore: boolean; nextCursor: string | null };
            }>;
            deleteThing: (input: { thingId: string }) => Promise<{ success: true }>;
          })
        | undefined;
      let templateClient: ReturnType<NonNullable<typeof templateFactory>> | undefined;
      if (templateFactory) {
        try {
          templateClient = templateFactory();
        } catch (cause) {
          yield* Effect.logWarning(
            `[API] Template plugin client unavailable — template-backed routes will return clean errors: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        }
      }

      console.log("[API] Services Initialized");

      return {
        tenants: tenantsService,
        nodes: nodesService,
        validators: validatorsService,
        templateClient,
        platformAccount: config.variables.platformAccount,
      };
    }),

  shutdown: () => Effect.log("[API] Shutdown"),

  createRouter: (services, builder) => {
    const { templateClient, platformAccount } = services;
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

    return {
      ping: builder.ping.handler(async () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
      })),

      listTenants: builder.listTenants.use(requireAuth).handler(async ({ context }) => {
        if (context.user.role === "admin") return services.tenants.listAllTenants();
        const orgId = context.organization?.activeOrganizationId;
        if (!orgId) {
          throw new ORPCError("FORBIDDEN", { message: "Active organization required" });
        }
        return services.tenants.listTenantsByOrgIds([orgId]);
      }),

      createTenant: builder.createTenant
        .use(requireAuth)
        .use(requireAdmin)
        .use(requireOrganization)
        .handler(async ({ input, context }) => {
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
          if (platformAccount && !isExplicitDaoMember(result.policy, platformAccount)) {
            throw new ORPCError("FORBIDDEN", {
              message: "Platform audit account is not a member of this DAO",
              data: { daoAccountId: input.accountId, platformAccount },
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

      resolveTenant: builder.resolveTenant.handler(async ({ input }) => {
        const tenant = await services.tenants.resolveTenantByAccountId(input.accountId);
        return tenant ?? null;
      }),

      resolveTenantByOrgId: builder.resolveTenantByOrgId.handler(async ({ input, errors }) => {
        const tenant = await services.tenants.resolveTenantByOrgId(input.orgId);
        if (!tenant) {
          throw errors.NOT_FOUND({
            message: "Tenant not found",
            data: { resource: "tenant", resourceId: input.orgId },
          });
        }
        return tenant;
      }),

      listTenantBindings: builder.listTenantBindings.handler(async () =>
        services.tenants.listBindings(),
      ),

      listTenantApps: builder.listTenantApps.handler(async () => services.tenants.listTenantApps()),

      listTenantBindingsForTenant: builder.listTenantBindingsForTenant
        .use(requireAuth)
        .handler(async ({ input }) => services.tenants.listBindingsForTenant(input.tenantId)),

      createBinding: builder.createBinding.use(requireAuth).handler(async ({ input, context }) => {
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
          await authorizedTenant(input, context);
          return await services.tenants.verifyCustomDomain(input.tenantId, input.bindingId);
        }),

      deleteBinding: builder.deleteBinding.use(requireAuth).handler(async ({ input, context }) => {
        await authorizedTenant(input, context);
        await services.tenants.deleteBinding(input.tenantId, input.bindingId);
        return { success: true as const };
      }),

      setPrimaryBinding: builder.setPrimaryBinding
        .use(requireAuth)
        .use(requireOrgRole("admin"))
        .handler(async ({ input, context }) => {
          await authorizedTenant(input, context);
          return await services.tenants.setPrimaryBinding(input.tenantId, input.bindingId);
        }),

      resolveBindingByHostname: builder.resolveBindingByHostname.handler(async ({ input }) => {
        const binding = await services.tenants.resolveBindingByHostname(input.hostname);
        return binding ?? null;
      }),

      bindingPreflight: builder.bindingPreflight.use(requireAuth).handler(async ({ input }) => {
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

      applyNodeProposal: builder.applyNodeProposal.use(requireAdmin).handler(async ({ input }) => {
        validateAccountId(input.accountId);
        validateAccountId(input.submitterAccountId);
        validateHostname(input.hostname);
        const result = await verifyDaoMembership({
          daoAccountId: input.accountId,
          memberAccountId: input.submitterAccountId,
        });
        if (!result.isMember) {
          throw new ORPCError("FORBIDDEN", {
            message: "The applicant's connected NEAR account is not a member of this DAO",
            data: {
              daoAccountId: input.accountId,
              submitterAccountId: input.submitterAccountId,
            },
          });
        }
        if (platformAccount && !isExplicitDaoMember(result.policy, platformAccount)) {
          throw new ORPCError("FORBIDDEN", {
            message: "Platform audit account is not a member of this DAO",
            data: { daoAccountId: input.accountId, platformAccount },
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
        });
      }),

      listNodes: builder.listNodes.handler(async ({ input }) =>
        services.nodes.list({
          ...(input.kind !== undefined && { kind: input.kind }),
          ...(input.parentId !== undefined && { parentId: input.parentId }),
          ...(input.tenantId !== undefined && { tenantId: input.tenantId }),
        }),
      ),

      listNodeSummaries: builder.listNodeSummaries.handler(async ({ input }) =>
        services.nodes.listSummaries({
          ...(input.scope === "roots" && { parentId: null }),
          ...(input.kind !== undefined && { kind: input.kind }),
        }),
      ),

      getNode: builder.getNode.handler(async ({ input }) => {
        const node = await services.nodes.getById(input.nodeId);
        return node ?? null;
      }),

      createNode: builder.createNode
        .use(requireAuth)
        .use(requireOrganization)
        .handler(async ({ input, context }) => {
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

      listRootNodes: builder.listRootNodes.handler(async () => services.nodes.listRootNodes()),

      listChildren: builder.listChildren.handler(async ({ input }) =>
        services.nodes.listChildren(input.nodeId),
      ),

      getSubtree: builder.getSubtree.handler(async ({ input }) => {
        const subtree = await services.nodes.subtreeWithValidators(input.nodeId);
        if (subtree.length === 0) {
          throw new ORPCError("NOT_FOUND", {
            message: "Node not found",
            data: { resource: "node", resourceId: input.nodeId },
          });
        }
        return subtree;
      }),

      getNodeSummary: builder.getNodeSummary.handler(async ({ input }) => {
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
          children: children.map(({ id, kind, slug, name }) => ({ id, kind, slug, name })),
        };
      }),

      resolveNodeBySlug: builder.resolveNodeBySlug.handler(async ({ input }) => {
        const node = await services.nodes.resolveBySlug(
          input.slug,
          input.parentId === undefined ? undefined : input.parentId,
        );
        return node ?? null;
      }),

      listValidators: builder.listValidators.handler(async ({ input }) =>
        services.validators.list({
          ...(input.nodeId !== undefined && { nodeId: input.nodeId }),
          ...(input.role !== undefined && { role: input.role }),
        }),
      ),

      listValidatorsByNode: builder.listValidatorsByNode.handler(async ({ input }) =>
        services.validators.listByNode(input.nodeId),
      ),

      getValidator: builder.getValidator.handler(async ({ input }) => {
        const validator = await services.validators.getById(input.validatorId);
        return validator ?? null;
      }),

      resolveValidatorByAccountId: builder.resolveValidatorByAccountId.handler(
        async ({ input }) => {
          const validator = await services.validators.resolveByAccountId(input.accountId);
          return validator ?? null;
        },
      ),

      resolveStakingValidators: builder.resolveStakingValidators.handler(async ({ input }) =>
        services.validators.resolveForStaking(input.nodeId),
      ),

      createValidator: builder.createValidator
        .use(requireAuth)
        .handler(async ({ input, context }) => {
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
          const validator = await services.validators.getById(input.validatorId);
          if (!validator) {
            throw new ORPCError("NOT_FOUND", {
              message: "Validator not found",
              data: { resource: "validator", resourceId: input.validatorId },
            });
          }
          await authorizedNodeForValidators(validator.nodeId, context);
          return services.validators.update(input.validatorId, {
            ...(input.accountId !== undefined && { accountId: input.accountId }),
            ...(input.network !== undefined && { network: input.network }),
            ...(input.protocol !== undefined && { protocol: input.protocol }),
            ...(input.role !== undefined && { role: input.role }),
            ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
            ...(input.metadata !== undefined && { metadata: input.metadata }),
          });
        }),

      deleteValidator: builder.deleteValidator
        .use(requireAuth)
        .handler(async ({ input, context }) => {
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

      createThing: builder.createThing.use(requireAuth).handler(async ({ input }) => {
        if (!templateClient) {
          throw new ORPCError("BAD_REQUEST", {
            message: "The template plugin is not included in this deployment",
          });
        }
        return await templateClient.createThing({ thingId: input.thingId, payload: input.payload });
      }),

      getThing: builder.getThing.handler(async ({ input }) => {
        if (!templateClient) {
          throw new ORPCError("BAD_REQUEST", {
            message: "The template plugin is not included in this deployment",
          });
        }
        return await templateClient.getThing({ thingId: input.thingId });
      }),

      listThings: builder.listThings.handler(async ({ input }) => {
        if (!templateClient) {
          throw new ORPCError("BAD_REQUEST", {
            message: "The template plugin is not included in this deployment",
          });
        }
        return await templateClient.listThings(input);
      }),

      deleteThing: builder.deleteThing.use(requireAuth).handler(async ({ input }) => {
        if (!templateClient) {
          throw new ORPCError("BAD_REQUEST", {
            message: "The template plugin is not included in this deployment",
          });
        }
        return await templateClient.deleteThing({ thingId: input.thingId });
      }),

      testError: builder.testError.handler(async ({ input }) => {
        switch (input.kind) {
          case "unauthorized":
            throw new ORPCError("UNAUTHORIZED", { message: "test unauthorized error" });
          case "forbidden":
            throw new ORPCError("FORBIDDEN", { message: "test forbidden error" });
          case "not_found":
            throw new ORPCError("NOT_FOUND", { message: "test not found error" });
          case "conflict":
            throw new ORPCError("CONFLICT", { message: "test conflict error" });
          case "bad_request":
            throw new ORPCError("BAD_REQUEST", { message: "test bad request error" });
          default:
            throw new Error("test internal server error");
        }
      }),
    };
  },
});
