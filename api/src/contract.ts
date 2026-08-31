import { BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNAUTHORIZED } from "every-plugin/errors";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

const ErrorTestKindSchema = z.enum([
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "bad_request",
  "internal",
]);

export const TenantStatusSchema = z.enum(["active", "pending", "suspended", "pending_deletion"]);

export const NodeKindSchema = z.enum(["country", "state", "city"]);

export const ValidatorRoleSchema = z.enum(["official", "community"]);

export const ProtocolSchema = z.string().default("near");

export const ValidatorSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  accountId: z.string(),
  network: z.string(),
  protocol: z.string(),
  role: ValidatorRoleSchema,
  isDefault: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Validator = z.infer<typeof ValidatorSchema>;

export const StakingValidatorsSchema = z.object({
  validators: z.array(ValidatorSchema),
  sourceNodeId: z.string(),
});

export type StakingValidators = z.infer<typeof StakingValidatorsSchema>;

export const TenantSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  orgId: z.string().nullable(),
  name: z.string(),
  status: TenantStatusSchema,
  allowUiOverrides: z.boolean(),
  allowBackendOverrides: z.boolean(),
  allowSsr: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export const TenantBindingSchema = z.object({
  hostname: z
    .string()
    .describe("Hostname that routes to this tenant (subdomain, custom domain, or alias)"),
  tenantId: z.string().describe("ID of the tenant that owns this binding"),
  accountId: z.string(),
  allowUiOverrides: z.boolean(),
  allowBackendOverrides: z.boolean(),
  allowSsr: z.boolean(),
  status: TenantStatusSchema,
});

export const TenantBindingRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  hostname: z.string(),
  isPrimary: z.boolean(),
  isVerified: z.boolean(),
  verificationToken: z.string(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const NodeSchema = z.object({
  id: z.string(),
  kind: NodeKindSchema,
  slug: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  tenantId: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Node = z.infer<typeof NodeSchema>;

export const SubtreeValidatorSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  network: z.string(),
  protocol: z.string(),
  role: ValidatorRoleSchema,
  isDefault: z.boolean(),
});

export const SubtreeNodeSchema = z.object({
  id: z.string(),
  kind: NodeKindSchema,
  slug: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  validators: z.array(SubtreeValidatorSchema),
});

export const NodeSummarySchema = z.object({
  node: NodeSchema,
  childrenCount: z.number().int().nonnegative(),
  subtreeNodeCount: z.number().int().nonnegative(),
  validators: z.array(ValidatorSchema),
  subtreeValidatorCount: z.number().int().nonnegative(),
  subtreeValidatorCountsByRole: z.object({
    official: z.number().int().nonnegative(),
    community: z.number().int().nonnegative(),
  }),
  stakingValidators: StakingValidatorsSchema,
  children: z.array(
    z.object({
      id: z.string(),
      kind: NodeKindSchema,
      slug: z.string(),
      name: z.string(),
    }),
  ),
});

export type NodeSummary = z.infer<typeof NodeSummarySchema>;

const ThingSchema = z.object({
  thingId: z.string().describe("Unique identifier for the thing"),
  type: z.string().describe("Plugin-derived thing type"),
  payload: z.unknown().describe("Plugin-owned thing payload"),
  createdAt: z.string().datetime().describe("ISO 8601 timestamp when the thing was created"),
  updatedAt: z.string().datetime().describe("ISO 8601 timestamp when the thing was last updated"),
});

const CreatedThingSchema = ThingSchema.extend({
  action: z.string().describe("Action emitted for the creation"),
});

const ListThingsSchema = z.object({
  data: z.array(ThingSchema).describe("List of things matching the query"),
  meta: z.object({
    total: z.number().describe("Total number of matching things"),
    hasMore: z.boolean().describe("Whether another page of results exists"),
    nextCursor: z.string().nullable().describe("Opaque cursor for the next page, or null if done"),
  }),
});

export const contract = oc.router({
  ping: oc.route({ method: "GET", path: "/ping" }).output(
    z.object({
      status: z.literal("ok"),
      timestamp: z.iso.datetime(),
    }),
  ),

  listTenants: oc
    .route({ method: "GET", path: "/tenants" })
    .output(z.array(TenantSchema))
    .errors({ UNAUTHORIZED, FORBIDDEN }),

  createTenant: oc
    .route({ method: "POST", path: "/tenants" })
    .input(
      z.object({
        name: z.string(),
        accountId: z.string(),
        status: z.enum(["active", "pending"]).optional(),
        allowUiOverrides: z.boolean().default(true),
        allowBackendOverrides: z.boolean().default(false),
        allowSsr: z.boolean().default(false),
      }),
    )
    .output(TenantSchema)
    .errors({
      UNAUTHORIZED,
      FORBIDDEN,
      BAD_REQUEST,
      CONFLICT: { status: 409, message: "Tenant with this accountId already exists" },
    }),

  updateTenant: oc
    .route({ method: "PATCH", path: "/tenants/{tenantId}" })
    .input(
      z.object({
        tenantId: z.string(),
        name: z.string().optional(),
        accountId: z.string().optional(),
        status: TenantStatusSchema.optional(),
        allowUiOverrides: z.boolean().optional(),
        allowBackendOverrides: z.boolean().optional(),
        allowSsr: z.boolean().optional(),
      }),
    )
    .output(TenantSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),

  deleteTenant: oc
    .route({ method: "POST", path: "/tenants/{tenantId}/delete" })
    .input(z.object({ tenantId: z.string() }))
    .output(TenantSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  suspendTenant: oc
    .route({ method: "POST", path: "/tenants/{tenantId}/suspend" })
    .input(z.object({ tenantId: z.string() }))
    .output(TenantSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  reactivateTenant: oc
    .route({ method: "POST", path: "/tenants/{tenantId}/reactivate" })
    .input(z.object({ tenantId: z.string() }))
    .output(TenantSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  resolveTenant: oc
    .route({ method: "GET", path: "/tenants/account/{accountId}" })
    .input(z.object({ accountId: z.string() }))
    .output(TenantSchema.nullable()),

  resolveTenantByOrgId: oc
    .route({ method: "GET", path: "/tenants/org/{orgId}" })
    .input(z.object({ orgId: z.string() }))
    .output(TenantSchema)
    .errors({ NOT_FOUND }),

  listTenantBindings: oc
    .route({
      method: "GET",
      path: "/tenants/bindings",
      summary: "List all active tenant domain bindings",
      description:
        "Public — returns hostname-to-tenant mapping used by the host's BindingResolver.",
    })
    .output(z.array(TenantBindingSchema)),

  listTenantBindingsForTenant: oc
    .route({
      method: "GET",
      path: "/tenants/{tenantId}/bindings",
      summary: "List domain bindings for a specific tenant",
    })
    .input(z.object({ tenantId: z.string() }))
    .output(z.array(TenantBindingRecordSchema))
    .errors({ UNAUTHORIZED, NOT_FOUND }),

  createBinding: oc
    .route({ method: "POST", path: "/tenants/{tenantId}/bindings" })
    .input(
      z.object({
        tenantId: z.string(),
        hostname: z.string(),
        isPrimary: z.boolean().default(false),
      }),
    )
    .output(TenantBindingRecordSchema)
    .errors({
      UNAUTHORIZED,
      FORBIDDEN,
      BAD_REQUEST,
      NOT_FOUND,
      CONFLICT: { status: 409, message: "Hostname already in use" },
    }),

  verifyCustomDomain: oc
    .route({ method: "POST", path: "/tenants/{tenantId}/bindings/{bindingId}/verify" })
    .input(z.object({ tenantId: z.string(), bindingId: z.string() }))
    .output(TenantBindingRecordSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  setPrimaryBinding: oc
    .route({ method: "POST", path: "/tenants/{tenantId}/bindings/{bindingId}/primary" })
    .input(z.object({ tenantId: z.string(), bindingId: z.string() }))
    .output(TenantBindingRecordSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  resolveBindingByHostname: oc
    .route({
      method: "GET",
      path: "/tenants/bindings/resolve",
      summary: "Resolve a binding by hostname",
      description:
        "Public — returns the binding record for a hostname (used by the host resolver).",
    })
    .input(z.object({ hostname: z.string() }))
    .output(TenantBindingRecordSchema.nullable()),

  bindingPreflight: oc
    .route({
      method: "POST",
      path: "/tenants/bindings/preflight",
      summary: "Check hostname availability for a new domain binding",
    })
    .input(z.object({ hostname: z.string() }))
    .output(
      z.object({
        hostname: z.object({
          available: z.boolean(),
          format: z.enum(["valid", "invalid"]),
        }),
      }),
    )
    .errors({ UNAUTHORIZED, BAD_REQUEST }),

  listNodes: oc
    .route({ method: "GET", path: "/nodes" })
    .input(
      z.object({
        kind: NodeKindSchema.optional(),
        parentId: z.string().nullable().optional(),
      }),
    )
    .output(z.array(NodeSchema)),

  getNode: oc
    .route({ method: "GET", path: "/nodes/{nodeId}" })
    .input(z.object({ nodeId: z.string() }))
    .output(NodeSchema.nullable()),

  createNode: oc
    .route({ method: "POST", path: "/nodes" })
    .input(
      z.object({
        kind: NodeKindSchema,
        slug: z.string(),
        name: z.string(),
        parentId: z.string().nullable().optional(),
        tenantId: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .output(NodeSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, BAD_REQUEST, NOT_FOUND }),

  updateNode: oc
    .route({ method: "PATCH", path: "/nodes/{nodeId}" })
    .input(
      z.object({
        nodeId: z.string(),
        kind: NodeKindSchema.optional(),
        slug: z.string().optional(),
        name: z.string().optional(),
        parentId: z.string().nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .output(NodeSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),

  deleteNode: oc
    .route({ method: "POST", path: "/nodes/{nodeId}/delete" })
    .input(z.object({ nodeId: z.string() }))
    .output(z.object({ success: z.literal(true) }))
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  listRootNodes: oc
    .route({
      method: "GET",
      path: "/nodes/roots",
      summary: "List root nodes (no parent)",
      description: "Public — returns top-level nodes such as countries or city-states.",
    })
    .output(z.array(NodeSchema)),

  listChildren: oc
    .route({ method: "GET", path: "/nodes/{nodeId}/children" })
    .input(z.object({ nodeId: z.string() }))
    .output(z.array(NodeSchema)),

  getSubtree: oc
    .route({
      method: "GET",
      path: "/nodes/{nodeId}/subtree",
      summary: "Get a node subtree with validators",
      description: "Public — returns the node and all descendants with validators per node.",
    })
    .input(z.object({ nodeId: z.string() }))
    .output(z.array(SubtreeNodeSchema))
    .errors({ NOT_FOUND }),

  getNodeSummary: oc
    .route({
      method: "GET",
      path: "/nodes/{nodeId}/summary",
      summary: "Get an aggregated node summary",
      description: "Public — returns node structure, validator totals, and staking resolution.",
    })
    .input(z.object({ nodeId: z.string() }))
    .output(NodeSummarySchema)
    .errors({ NOT_FOUND }),

  resolveNodeBySlug: oc
    .route({ method: "GET", path: "/nodes/resolve" })
    .input(
      z.object({
        slug: z.string(),
        parentId: z.string().nullable().optional(),
      }),
    )
    .output(NodeSchema.nullable()),

  listValidators: oc
    .route({
      method: "GET",
      path: "/validators",
      summary: "List validators with optional filters",
    })
    .input(
      z.object({
        nodeId: z.string().optional(),
        role: ValidatorRoleSchema.optional(),
      }),
    )
    .output(z.array(ValidatorSchema)),

  listValidatorsByNode: oc
    .route({
      method: "GET",
      path: "/validators/by-node/{nodeId}",
      summary: "List all validators directly attached to a node",
    })
    .input(z.object({ nodeId: z.string() }))
    .output(z.array(ValidatorSchema)),

  getValidator: oc
    .route({ method: "GET", path: "/validators/{validatorId}" })
    .input(z.object({ validatorId: z.string() }))
    .output(ValidatorSchema.nullable()),

  resolveValidatorByAccountId: oc
    .route({
      method: "GET",
      path: "/validators/resolve",
      summary: "Resolve a validator by accountId",
    })
    .input(z.object({ accountId: z.string() }))
    .output(ValidatorSchema.nullable()),

  resolveStakingValidators: oc
    .route({
      method: "GET",
      path: "/validators/staking/{nodeId}",
      summary: "Resolve validators for staking from a node (subtree + ancestor walk-up)",
      description:
        "Returns the validators that should be used for staking from this node. First searches the node's subtree (self + descendants). If empty, walks up parent_id until validators are found.",
    })
    .input(z.object({ nodeId: z.string() }))
    .output(StakingValidatorsSchema),

  createValidator: oc
    .route({ method: "POST", path: "/validators" })
    .input(
      z.object({
        nodeId: z.string(),
        accountId: z.string(),
        network: z.string().default("mainnet"),
        protocol: ProtocolSchema,
        role: ValidatorRoleSchema.default("official"),
        isDefault: z.boolean().default(false),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .output(ValidatorSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),

  updateValidator: oc
    .route({ method: "PATCH", path: "/validators/{validatorId}" })
    .input(
      z.object({
        validatorId: z.string(),
        accountId: z.string().optional(),
        network: z.string().optional(),
        protocol: z.string().optional(),
        role: ValidatorRoleSchema.optional(),
        isDefault: z.boolean().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .output(ValidatorSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),

  deleteValidator: oc
    .route({ method: "POST", path: "/validators/{validatorId}/delete" })
    .input(z.object({ validatorId: z.string() }))
    .output(z.object({ success: z.literal(true) }))
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  setDefaultValidator: oc
    .route({ method: "POST", path: "/validators/{validatorId}/default" })
    .input(z.object({ validatorId: z.string() }))
    .output(ValidatorSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  createThing: oc
    .route({
      method: "POST",
      path: "/things",
      summary: "Create a thing",
      description: "Creates a DB-backed thing via the template plugin.",
      tags: ["Things"],
    })
    .input(
      z.object({
        thingId: z.string().min(1, "Thing ID is required"),
        payload: z.unknown(),
      }),
    )
    .output(CreatedThingSchema)
    .errors({
      UNAUTHORIZED,
      CONFLICT: { status: 409, message: "A thing with this ID already exists" },
    }),

  getThing: oc
    .route({
      method: "GET",
      path: "/things/{thingId}",
      summary: "Get a thing",
      description: "Returns a DB-backed thing by ID via the template plugin.",
      tags: ["Things"],
    })
    .input(
      z.object({
        thingId: z.string().min(1, "Thing ID is required"),
      }),
    )
    .output(ThingSchema)
    .errors({ NOT_FOUND }),

  listThings: oc
    .route({
      method: "GET",
      path: "/things",
      summary: "List things",
      description:
        "Lists things from the template plugin with optional type filtering and cursor pagination.",
      tags: ["Things"],
    })
    .input(
      z.object({
        type: z.string().optional().describe("Filter by thing type"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(10)
          .describe("Maximum number of results to return"),
        cursor: z.string().optional().describe("Opaque cursor for the next page"),
      }),
    )
    .output(ListThingsSchema),

  deleteThing: oc
    .route({
      method: "DELETE",
      path: "/things/{thingId}",
      summary: "Delete a thing",
      description: "Removes a DB-backed thing via the template plugin.",
      tags: ["Things"],
    })
    .input(z.object({ thingId: z.string().min(1, "Thing ID is required") }))
    .output(z.object({ success: z.literal(true) }))
    .errors({ UNAUTHORIZED, NOT_FOUND }),

  testError: oc
    .route({
      method: "GET",
      path: "/errors",
      summary: "Trigger a specific error kind",
      description:
        "Regression-test helper that throws the requested error kind so the host error surface can be validated.",
      tags: ["Testing"],
    })
    .input(
      z.object({
        kind: ErrorTestKindSchema.describe("Which error kind to trigger"),
      }),
    )
    .output(
      z.object({
        ok: z.literal(true).describe("Always true when no error is thrown"),
      }),
    )
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),
});

export type ContractType = typeof contract;
