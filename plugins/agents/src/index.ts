import {
  balanceList,
  configureDatabase,
  configureOutlayer,
  configureRuntime,
  configureSponsorClients,
  generateIntent,
  generateResponse,
  getAgentView,
  getTokenCatalog,
  listAgentGrants,
  listAgents,
  listScheduledExecutions,
  readBudget,
  readHistory,
  readLimits,
  readPolicy,
  readPolicyHistory,
  readStatus,
  readTimelock,
  submitIntent,
  walletView,
} from "@near-intents-agent-api/agents-core";
import { envSchema } from "@near-intents-agent-api/agents-core/config";
import * as views from "@near-intents-agent-api/agents-core/views";
import { agents } from "@near-intents-agent-api/database/schema";
import { createOutlayerClient } from "@near-intents-agent-api/outlayer";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { createPlugin } from "every-plugin";
import { z } from "zod";
import { actorForSession } from "./actor";
import { ContextSchema } from "./context";
import { contract } from "./contract";
import { DatabaseLive, DatabaseTag } from "./db/layer";

export default createPlugin({
  variables: z.object({
    agentsNearRpcUrls: z
      .string()
      .default("https://near.drpc.org,https://free.rpc.fastnear.com")
      .describe("Comma-separated NEAR RPC endpoints used by the sponsor and verification paths"),
    agentsSponsorDailyGlobalLimit: z.number().min(1).default(100),
    agentsSponsorDailyTenantLimit: z.number().min(1).default(20),
    agentsSponsorDailyAgentLimit: z.number().min(1).default(10),
  }),

  secrets: z.object({
    AGENTS_DATABASE_URL: z
      .string()
      .default("pglite:.bos/agents/:memory:")
      .describe(
        "Dedicated database connection string. Use pglite: for local dev/tests, postgres:// for production.",
      ),
    AGENTS_SPONSOR_KEYS: z
      .string()
      .optional()
      .describe(
        "JSON array of { accountId, privateKey } sponsor FullAccess keys (NEAR_SPONSOR_KEYS format). Sponsor features are disabled when absent.",
      ),
    AGENTS_SECRET_ENCRYPTION_KEYS: z
      .string()
      .optional()
      .describe("JSON map of env:vN → 32+ byte encryption keys for grant tokens at rest"),
    AGENTS_SECRET_ENCRYPTION_ACTIVE_KEY_ID: z.string().optional(),
  }),

  context: ContextSchema,

  contract,

  initialize: (config) => {
    const coreWiring = Layer.effectDiscard(
      Effect.gen(function* () {
        const database = yield* DatabaseTag;

        const envConfig = envSchema.parse({
          DATABASE_URL: config.secrets.AGENTS_DATABASE_URL,
          BETTER_AUTH_URL: "https://agents.local",
          TRUSTED_ORIGINS: "https://citynode.app",
          NEAR_RPC_URLS: config.variables.agentsNearRpcUrls,
          ...(config.secrets.AGENTS_SPONSOR_KEYS
            ? { NEAR_SPONSOR_KEYS: config.secrets.AGENTS_SPONSOR_KEYS }
            : {}),
          ...(config.secrets.AGENTS_SECRET_ENCRYPTION_KEYS
            ? { SECRET_ENCRYPTION_KEYS: config.secrets.AGENTS_SECRET_ENCRYPTION_KEYS }
            : {}),
          ...(config.secrets.AGENTS_SECRET_ENCRYPTION_ACTIVE_KEY_ID
            ? {
                SECRET_ENCRYPTION_ACTIVE_KEY_ID:
                  config.secrets.AGENTS_SECRET_ENCRYPTION_ACTIVE_KEY_ID,
              }
            : {}),
          SPONSOR_DAILY_GLOBAL_LIMIT: config.variables.agentsSponsorDailyGlobalLimit,
          SPONSOR_DAILY_TENANT_LIMIT: config.variables.agentsSponsorDailyTenantLimit,
          SPONSOR_DAILY_AGENT_LIMIT: config.variables.agentsSponsorDailyAgentLimit,
        });

        configureDatabase(database);
        configureRuntime({
          trustedOrigins: envConfig.TRUSTED_ORIGINS,
          secretEncryptionKeys: envConfig.SECRET_ENCRYPTION_KEYS,
          secretEncryptionActiveKeyId: envConfig.SECRET_ENCRYPTION_ACTIVE_KEY_ID,
          nearRpcUrls: envConfig.NEAR_RPC_URLS,
          network: "mainnet",
          serviceUrl: envConfig.BETTER_AUTH_URL,
          sponsorDailyGlobalLimit: envConfig.SPONSOR_DAILY_GLOBAL_LIMIT,
          sponsorDailyTenantLimit: envConfig.SPONSOR_DAILY_TENANT_LIMIT,
          sponsorDailyAgentLimit: envConfig.SPONSOR_DAILY_AGENT_LIMIT,
          walletPolicyStorageLimitYocto: envConfig.NEAR_POLICY_STORAGE_DEPOSIT_YOCTO,
          sponsorAccountId: envConfig.NEAR_SPONSOR_KEYS[0]?.accountId,
          logLevel: envConfig.LOG_LEVEL,
        });
        configureOutlayer(createOutlayerClient());

        if (envConfig.NEAR_SPONSOR_KEYS.length > 0) {
          const lock = database.tryAdvisoryLock;
          if (!lock) {
            yield* Effect.logWarning(
              "[Agents] Sponsor keys provided but the pglite engine has no advisory locks — sponsor features disabled (use postgres for full sponsor support)",
            );
          } else {
            yield* Effect.tryPromise({
              try: () => configureSponsorClients(envConfig, lock),
              catch: (cause) => new Error(`sponsor_configuration_failed: ${String(cause)}`),
            });
          }
        } else {
          yield* Effect.logWarning(
            "[Agents] No AGENTS_SPONSOR_KEYS configured — sponsor features (wallet init, policy writes, relay) are disabled",
          );
        }
      }),
    );

    return Effect.succeed(
      DatabaseLive(config.secrets.AGENTS_DATABASE_URL).pipe(Layer.provide(coreWiring)),
    );
  },

  createRouter: (builder) => {
    return {
      ping: builder.ping.handler(async ({ input }) => {
        return {
          message: input.message ? `pong: ${input.message}` : "pong",
          timestamp: new Date().toISOString(),
        };
      }),

      dbHealth: builder.dbHealth.effect(function* () {
        const database = yield* DatabaseTag;
        const rows = yield* Effect.tryPromise(() =>
          database.db.select({ count: sql<number>`count(*)::int` }).from(agents),
        ).pipe(Effect.catch(() => Effect.succeed([{ count: -1 }])));
        const count = rows[0]?.count ?? -1;
        return { ok: count >= 0, agentCount: Math.max(count, 0) };
      }),

      generateIntent: builder.generateIntent.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        const idempotencyKey = context.reqHeaders?.get("idempotency-key") ?? undefined;
        const { row, replayed } = yield* Effect.tryPromise(() =>
          generateIntent(actor, input, idempotencyKey),
        );
        return { ...generateResponse(row), replayed };
      }),

      submitIntent: builder.submitIntent.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(() => submitIntent(actor, input));
      }),

      intentStatus: builder.intentStatus.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(() => readStatus(actor, input.correlationId, input.waitMs));
      }),

      listAgents: builder.listAgents.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        const page = yield* Effect.tryPromise(() =>
          listAgents(actor, {
            ...(input.externalUserId ? { externalUserId: input.externalUserId } : {}),
            ...(input.cursor ? { after: input.cursor } : {}),
          }),
        );
        return { data: page.agents.map(views.agentView), nextCursor: page.next_cursor };
      }),

      getAgent: builder.getAgent.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(async () =>
          views.agentView(await getAgentView(actor, input.agentId)),
        );
      }),

      getWallet: builder.getWallet.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(async () =>
          views.walletView(await walletView(actor, input.agentId)),
        );
      }),

      getBalances: builder.getBalances.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        const list = yield* Effect.tryPromise(() =>
          balanceList(actor, input.agentId, { source: input.source }),
        );
        return {
          nearAccountId: list.near_account_id,
          source: input.source,
          balances: list.balances
            .filter((entry) => !input.asset || entry.assetId === input.asset)
            .map(views.balanceEntry),
        };
      }),

      getPolicy: builder.getPolicy.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(async () =>
          views.policyView(await readPolicy(actor, input.agentId)),
        );
      }),

      getPolicyHistory: builder.getPolicyHistory.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        const history = yield* Effect.tryPromise(() =>
          readPolicyHistory(actor, input.agentId, {
            limit: input.limit,
            ...(input.cursor ? { beforeRevision: input.cursor } : {}),
          }),
        );
        return views.policyHistoryView(history);
      }),

      getLimits: builder.getLimits.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(async () =>
          views.limitsView(await readLimits(actor, input.agentId)),
        );
      }),

      getBudget: builder.getBudget.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(async () =>
          views.budgetView(await readBudget(actor, input.agentId)),
        );
      }),

      getTimelock: builder.getTimelock.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(async () =>
          views.timelockView(await readTimelock(actor, input.agentId)),
        );
      }),

      listScheduledExecutions: builder.listScheduledExecutions.effect(function* ({
        input,
        context,
        errors,
      }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        const page = yield* Effect.tryPromise(() =>
          listScheduledExecutions(actor, input.agentId, input),
        );
        return views.scheduledPage(page);
      }),

      getTokenCatalog: builder.getTokenCatalog.effect(function* () {
        const catalog = getTokenCatalog();
        return { data: yield* Effect.tryPromise(() => catalog.list()) };
      }),

      getHistory: builder.getHistory.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        return yield* Effect.tryPromise(() => readHistory(actor, input.agentId, input));
      }),

      listGrants: builder.listGrants.effect(function* ({ input, context, errors }) {
        if (!context.userId)
          return yield* Effect.fail(errors.UNAUTHORIZED({ data: { apiKeyProvided: false } }));
        const database = yield* DatabaseTag;
        const actor = yield* Effect.tryPromise(() => actorForSession(database, context.userId!));
        const grants = yield* Effect.tryPromise(() => listAgentGrants(actor, input.agentId));
        return { data: grants.map(views.grantView) };
      }),
    };
  },
});
