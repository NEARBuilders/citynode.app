import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createPluginRuntime } from "every-plugin";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Plugin from "../index";
import { escapeLikePattern } from "../services/proposals";

function testNear(primaryAccountId: string) {
  return { primaryAccountId, linkedAccounts: [], hasNearAccount: true };
}

function testUser(id: string, role: string) {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    image: null,
    role,
    isAnonymous: false,
    locale: null,
  };
}

vi.mock("virtual:drizzle-migrations.sql", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../db/migrations/0000_concerned_blade.sql", import.meta.url),
    "utf8",
  );
  const repairSource = await readFile(
    new URL("../db/migrations/0001_legacy_lifecycle_repair.sql", import.meta.url),
    "utf8",
  );
  const applyStepsSource = await readFile(
    new URL("../db/migrations/0003_apply_steps.sql", import.meta.url),
    "utf8",
  );
  const dropLifecycleSource = await readFile(
    new URL("../db/migrations/0004_drop_apply_lifecycle.sql", import.meta.url),
    "utf8",
  );
  return {
    default: [
      {
        idx: 0,
        when: 1780344361156,
        hash: "proposals-private-test",
        tag: "proposals-private-test",
        sql: source.split("--> statement-breakpoint").map((statement) => statement.trim()),
      },
      {
        idx: 1,
        when: 1788541800000,
        hash: "proposals-legacy-lifecycle-repair-test",
        tag: "proposals-legacy-lifecycle-repair-test",
        sql: repairSource.split("--> statement-breakpoint").map((statement) => statement.trim()),
      },
      {
        idx: 3,
        when: 1791763200000,
        hash: "proposals-apply-steps-test",
        tag: "proposals-apply-steps-test",
        sql: applyStepsSource
          .split("--> statement-breakpoint")
          .map((statement) => statement.trim()),
      },
      {
        idx: 4,
        when: 1794700800000,
        hash: "proposals-drop-apply-lifecycle-test",
        tag: "proposals-drop-apply-lifecycle-test",
        sql: dropLifecycleSource
          .split("--> statement-breakpoint")
          .map((statement) => statement.trim()),
      },
    ],
  };
});

describe.sequential("Proposals plugin", () => {
  const runtime = createPluginRuntime({ registry: { proposals: { module: Plugin } } });
  let dataDir: string;
  let loaded: Awaited<ReturnType<typeof runtime.usePlugin<"proposals">>>;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "nearbuilders-proposals-plugin-"));
    loaded = await runtime.usePlugin("proposals", {
      variables: { privatePluginIds: ["nearcatalog"] },
      secrets: { PROPOSALS_DATABASE_URL: `pglite:${dataDir}` },
    });

    await loaded
      .createClient({
        userId: "user-alice",
        near: testNear("alice.near"),
        user: testUser("user-alice", "member"),
        allowPrivateSubmission: true,
        resubmissionPolicy: "rejected-only",
      })
      .propose({
        pluginId: "nearcatalog",
        entityId: "claim:alice.near:ref-finance",
        payload: { roles: ["Developer"] },
        idempotencyKey: "alice-private-base",
      });
    await loaded
      .createClient({
        userId: "user-bob",
        near: testNear("bob.near"),
        user: testUser("user-bob", "member"),
        allowPrivateSubmission: true,
        resubmissionPolicy: "rejected-only",
      })
      .propose({
        pluginId: "nearcatalog",
        entityId: "claim:bob.near:ref-finance",
        payload: { roles: ["Designer"] },
        idempotencyKey: "bob-private-base",
      });
    await loaded
      .createClient({
        userId: "user-alice",
        near: testNear("alice.near"),
        user: testUser("user-alice", "member"),
      })
      .propose({
        pluginId: "builders",
        entityId: "public-builder.near",
        payload: { name: "Public Builder" },
        idempotencyKey: "public-base",
      });
  });

  afterAll(async () => {
    await runtime.shutdown();
    await rm(dataDir, { recursive: true, force: true });
  });

  function aliceClient() {
    return loaded.createClient({
      userId: "user-alice",
      near: testNear("alice.near"),
      user: testUser("user-alice", "member"),
      allowPrivateSubmission: true,
      resubmissionPolicy: "rejected-only",
    });
  }

  function bobClient() {
    return loaded.createClient({
      userId: "user-bob",
      near: testNear("bob.near"),
      user: testUser("user-bob", "member"),
      allowPrivateSubmission: true,
      resubmissionPolicy: "rejected-only",
    });
  }

  function adminClient() {
    return loaded.createClient({
      userId: "admin",
      near: testNear("admin.near"),
      user: testUser("admin", "admin"),
    });
  }

  it("scopes private data to owners while retaining public reads and admin moderation", async () => {
    const anonymous = loaded.createClient();
    const privateInput = { pluginId: "nearcatalog", limit: 100 };

    const anonymousPrivate = await anonymous.getProposals(privateInput);
    const alicePrivate = await aliceClient().getProposals(privateInput);
    const bobPrivate = await bobClient().getProposals(privateInput);
    const adminPrivate = await adminClient().getProposals(privateInput);
    const anonymousAll = await anonymous.getProposals({ limit: 100 });

    expect(anonymousPrivate.data).toEqual([]);
    expect(alicePrivate.data.map((proposal) => proposal.createdBy)).toEqual(["[hidden]"]);
    expect(bobPrivate.data.map((proposal) => proposal.createdBy)).toEqual(["[hidden]"]);
    expect(adminPrivate.data).toHaveLength(2);
    expect(anonymousAll.data.map((proposal) => proposal.pluginId)).toEqual(["builders"]);

    const entityId = "claim:alice.near:ref-finance";
    await expect(anonymous.getAuditLog({ pluginId: "nearcatalog", entityId })).rejects.toThrow(
      "Authentication required",
    );
    await expect(bobClient().getAuditLog({ pluginId: "nearcatalog", entityId })).rejects.toThrow(
      "Admin access required",
    );
    await expect(aliceClient().getAuditLog({ pluginId: "nearcatalog", entityId })).rejects.toThrow(
      "Admin access required",
    );
    const adminAudit = await adminClient().getAuditLog({ pluginId: "nearcatalog", entityId });
    const bobCount = await bobClient().getProposalCount({ pluginId: "nearcatalog", entityId });
    const aliceCount = await aliceClient().getProposalCount({
      pluginId: "nearcatalog",
      entityId,
    });

    expect(adminAudit.data).toHaveLength(1);
    expect(bobCount.totalCount).toBe(0);
    expect(aliceCount.totalCount).toBe(1);

    const input = {
      pluginId: "nearcatalog",
      entityId: "claim:alice.near:admin-review",
      payload: { roles: ["Product"] },
      idempotencyKey: "admin-review",
    };
    const directClient = loaded.createClient({
      userId: "user-alice",
      near: testNear("alice.near"),
      user: testUser("user-alice", "member"),
    });
    await expect(directClient.propose(input)).rejects.toThrow(
      "Use the plugin's dedicated proposal endpoint",
    );
    const proposed = await aliceClient().propose(input);

    await expect(
      aliceClient().reject({
        pluginId: input.pluginId,
        entityId: input.entityId,
        expectedUpdatedAt: proposed.data.updatedAt,
      }),
    ).rejects.toThrow("Admin access required");

    const rejected = await adminClient().reject({
      pluginId: input.pluginId,
      entityId: input.entityId,
      expectedUpdatedAt: proposed.data.updatedAt,
      reason: "Add another role",
    });

    expect(rejected.data.reviewStatus).toBe("rejected");
    expect(rejected.data.rejectionReason).toBe("Add another role");
  });

  it("recognizes authenticated submission aliases without exposing submissions", async () => {
    await expect(
      loaded.createClient().getMySubmission({
        pluginId: "builders",
        entityId: "public-builder.near",
      }),
    ).rejects.toThrow("Authentication required");

    await expect(
      aliceClient().getMySubmission({
        pluginId: "builders",
        entityId: "public-builder.near",
      }),
    ).resolves.toEqual({ hasSubmitted: true });
    await expect(
      bobClient().getMySubmission({
        pluginId: "builders",
        entityId: "public-builder.near",
      }),
    ).resolves.toEqual({ hasSubmitted: false });

    const legacyUser = loaded.createClient({
      userId: "legacy-user-id",
      user: testUser("legacy-user-id", "member"),
    });
    await legacyUser.propose({
      pluginId: "builders",
      entityId: "legacy-user-submission.near",
      payload: { name: "Legacy User" },
    });

    const linkedLegacyUser = loaded.createClient({
      userId: "legacy-user-id",
      near: testNear("current-wallet.near"),
      user: testUser("legacy-user-id", "member"),
    });
    await expect(
      linkedLegacyUser.getMySubmission({
        pluginId: "builders",
        entityId: "legacy-user-submission.near",
      }),
    ).resolves.toEqual({ hasSubmitted: true });

    await loaded
      .createClient({
        userId: "historical-user-id",
        near: testNear("legacy-wallet.near"),
        user: testUser("historical-user-id", "member"),
      })
      .propose({
        pluginId: "builders",
        entityId: "legacy-near-submission.near",
        payload: { name: "Legacy NEAR" },
      });
    const linkedLegacyNear = loaded.createClient({
      userId: "current-user-id",
      near: {
        ...testNear("current-wallet.near"),
        linkedAccounts: [
          {
            accountId: "legacy-wallet.near",
            network: "mainnet",
            publicKey: "legacy-public-key",
            isPrimary: false,
          },
        ],
      },
      user: testUser("current-user-id", "member"),
    });
    await expect(
      linkedLegacyNear.getMySubmission({
        pluginId: "builders",
        entityId: "legacy-near-submission.near",
      }),
    ).resolves.toEqual({ hasSubmitted: true });
  });

  it("keeps retries idempotent and only permits rejected proposal revisions", async () => {
    const input = {
      pluginId: "nearcatalog",
      entityId: "claim:alice.near:idempotent-project",
      payload: { roles: ["Developer"] },
      idempotencyKey: "idempotent-submission",
    };

    const first = await aliceClient().propose(input);
    const retry = await aliceClient().propose(input);

    expect(retry.data.id).toBe(first.data.id);
    expect(retry.data.submissionCount).toBe(1);
    await expect(
      aliceClient().propose({ ...input, idempotencyKey: "pending-revision" }),
    ).rejects.toThrow("This proposal is already pending");
    await expect(
      bobClient().propose({ ...input, entityId: "claim:bob.near:idempotent-project" }),
    ).rejects.toThrow("Idempotency key was already used");

    await adminClient().reject({
      pluginId: "nearcatalog",
      entityId: input.entityId,
      expectedUpdatedAt: first.data.updatedAt,
      reason: "Clarify the contribution",
    });

    const resubmitted = await aliceClient().propose({
      ...input,
      payload: { roles: ["Developer", "Community"] },
      idempotencyKey: "rejected-revision",
    });

    expect(resubmitted.data.id).toBe(first.data.id);
    expect(resubmitted.data.reviewStatus).toBe("pending");
    expect(resubmitted.data.rejectionReason).toBeNull();
    expect(resubmitted.data.submissionCount).toBe(2);
    expect(resubmitted.data.payload).toEqual({ roles: ["Developer", "Community"] });

    const approved = await adminClient().approve({
      pluginId: input.pluginId,
      entityId: input.entityId,
      expectedUpdatedAt: resubmitted.data.updatedAt,
    });
    await expect(
      aliceClient().propose({ ...input, idempotencyKey: "approved-revision" }),
    ).rejects.toThrow("This proposal is already approved");
    await expect(
      adminClient().reject({
        pluginId: input.pluginId,
        entityId: input.entityId,
        expectedUpdatedAt: approved.data.updatedAt,
      }),
    ).rejects.toThrow("Only pending proposals can be rejected");
    await expect(
      adminClient().approve({
        pluginId: input.pluginId,
        entityId: input.entityId,
        expectedUpdatedAt: approved.data.updatedAt,
      }),
    ).rejects.toThrow("Only pending proposals can be approved");
  });

  it("lets admins reopen rejected proposals and records the action", async () => {
    const input = {
      pluginId: "events",
      entityId: "reopened-review",
      payload: { title: "Reopened Review" },
      idempotencyKey: "reopened-review",
    };

    const proposed = await aliceClient().propose(input);
    const rejected = await adminClient().reject({
      pluginId: input.pluginId,
      entityId: input.entityId,
      expectedUpdatedAt: proposed.data.updatedAt,
      reason: "Needs another review",
    });

    await expect(
      aliceClient().reopen({
        pluginId: input.pluginId,
        entityId: input.entityId,
        expectedUpdatedAt: rejected.data.updatedAt,
      }),
    ).rejects.toThrow("Admin access required");

    const reopened = await adminClient().reopen({
      pluginId: input.pluginId,
      entityId: input.entityId,
      expectedUpdatedAt: rejected.data.updatedAt,
    });

    expect(reopened.data.reviewStatus).toBe("pending");
    expect(reopened.data.rejectionReason).toBeNull();

    const audit = await adminClient().getAuditLog({
      pluginId: input.pluginId,
      entityId: input.entityId,
    });
    expect(audit.data[0]).toMatchObject({
      action: "reopened",
      actor: "admin",
      actorLabel: "admin",
    });

    await expect(
      adminClient().reopen({
        pluginId: input.pluginId,
        entityId: input.entityId,
        expectedUpdatedAt: reopened.data.updatedAt,
      }),
    ).rejects.toThrow("Only rejected proposals can be reopened");
  });

  it("rejects an admin decision made against a stale proposal version", async () => {
    const input = {
      pluginId: "events",
      entityId: "stale-admin-decision",
      payload: { title: "Stale decision" },
      idempotencyKey: "stale-admin-decision",
    };
    const proposed = await aliceClient().propose(input);

    await adminClient().approve({
      pluginId: input.pluginId,
      entityId: input.entityId,
      expectedUpdatedAt: proposed.data.updatedAt,
    });

    await expect(
      adminClient().reject({
        pluginId: input.pluginId,
        entityId: input.entityId,
        expectedUpdatedAt: proposed.data.updatedAt,
      }),
    ).rejects.toThrow("This proposal changed");
  });

  it("provides admins with reviewer history", async () => {
    const input = {
      pluginId: "builders",
      entityId: "review-history.near",
      payload: { name: "Review History" },
      idempotencyKey: "review-history",
    };

    const proposed = await aliceClient().propose(input);
    await adminClient().approve({
      pluginId: input.pluginId,
      entityId: input.entityId,
      expectedUpdatedAt: proposed.data.updatedAt,
    });

    const audit = await adminClient().getAuditLog({
      pluginId: input.pluginId,
      entityId: input.entityId,
    });
    expect(audit.data[0]).toMatchObject({
      action: "approved",
      actor: "admin",
      actorLabel: "admin",
    });

    await expect(aliceClient().getReviewHistory({ pluginId: "builders" })).rejects.toThrow(
      "Admin access required",
    );

    const history = await adminClient().getReviewHistory({ pluginId: "builders" });
    const review = history.data.find((entry) => entry.entityId === input.entityId);

    expect(review).toMatchObject({
      pluginId: "builders",
      entityId: input.entityId,
      action: "approved",
      actor: "admin",
      actorLabel: "admin",
      proposal: {
        createdBy: "alice.near",
        reviewStatus: "approved",
        payload: { name: "Review History" },
      },
    });
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE metacharacters so they match literally", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("c\\d")).toBe("c\\\\d");
    expect(escapeLikePattern("plain")).toBe("plain");
  });
});

describe.sequential("getProposals search and submission counts", () => {
  const runtime = createPluginRuntime({ registry: { proposals: { module: Plugin } } });
  let dataDir: string;
  let loaded: Awaited<ReturnType<typeof runtime.usePlugin<"proposals">>>;

  const member = () =>
    loaded.createClient({ userId: "u", near: testNear("u.near"), user: testUser("u", "member") });
  const admin = () =>
    loaded.createClient({
      userId: "admin",
      near: testNear("admin.near"),
      user: testUser("admin", "admin"),
    });

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "proposals-search-"));
    loaded = await runtime.usePlugin("proposals", {
      variables: { privatePluginIds: [] },
      secrets: { PROPOSALS_DATABASE_URL: `pglite:${dataDir}` },
    });

    for (const [entityId, name] of [
      ["alpha.near", "alpha"],
      ["100%-done.near", "pct"],
      ["a_b.near", "under"],
    ] as const) {
      await member().propose({
        pluginId: "builders",
        entityId,
        payload: { name },
        idempotencyKey: entityId,
      });
    }

    const betaFirst = await member().propose({
      pluginId: "builders",
      entityId: "beta.near",
      payload: { name: "beta" },
      idempotencyKey: "beta-1",
    });
    await admin().reject({
      pluginId: "builders",
      entityId: "beta.near",
      expectedUpdatedAt: betaFirst.data.updatedAt,
      reason: "redo",
    });
    await member().propose({
      pluginId: "builders",
      entityId: "beta.near",
      payload: { name: "beta2" },
      idempotencyKey: "beta-2",
    });
  });

  afterAll(async () => {
    await runtime.shutdown();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("matches a literal % instead of treating it as a wildcard", async () => {
    const result = await member().getProposals({ query: "%", limit: 50 });
    expect(result.data.map((proposal) => proposal.entityId)).toEqual(["100%-done.near"]);
  });

  it("matches a literal _ instead of treating it as a wildcard", async () => {
    const result = await member().getProposals({ query: "_", limit: 50 });
    expect(result.data.map((proposal) => proposal.entityId)).toEqual(["a_b.near"]);
  });

  it("returns the correct submission count for every row in one page", async () => {
    const result = await member().getProposals({ pluginId: "builders", limit: 50 });
    const counts = Object.fromEntries(
      result.data.map((proposal) => [proposal.entityId, proposal.submissionCount]),
    );
    expect(counts["beta.near"]).toBe(2);
    expect(counts["alpha.near"]).toBe(1);
    expect(counts["a_b.near"]).toBe(1);
    expect(counts["100%-done.near"]).toBe(1);
  });

  it("fetches proposals with a bounded number of queries (no N+1)", async () => {
    const baseProto = Object.getPrototypeOf(PGlite.prototype);
    const originalQuery = baseProto.query;
    let queryCount = 0;
    baseProto.query = async function (this: any, ...args: any[]) {
      queryCount++;
      return originalQuery.apply(this, args);
    };
    try {
      const result = await member().getProposals({ pluginId: "builders", limit: 50 });
      expect(result.data.length).toBe(4);
      // Fixed code: 3 queries (count + rows + grouped submission counts).
      // N+1 regression would use 2 + N queries (6 for 4 proposals).
      expect(queryCount).toBeLessThanOrEqual(5);
    } finally {
      baseProto.query = originalQuery;
    }
  });

  it("maps database failures to INTERNAL_SERVER_ERROR", async () => {
    const baseProto = Object.getPrototypeOf(PGlite.prototype);
    const originalQuery = baseProto.query;
    baseProto.query = async () => {
      throw new Error("simulated DB failure");
    };
    try {
      await expect(member().getProposals({ pluginId: "builders", limit: 50 })).rejects.toThrow(
        "Failed to query proposals",
      );
    } finally {
      baseProto.query = originalQuery;
    }
  });
});
