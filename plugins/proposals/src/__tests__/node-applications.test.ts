import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginRuntime } from "every-plugin";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Plugin from "../index";

const daoPolicy = vi.hoisted(() => ({ members: ["alice.near"] }));

vi.mock("near-kit", () => ({
  Near: class {
    view() {
      return Promise.resolve({ roles: [{ kind: { Group: daoPolicy.members } }] });
    }
  },
}));

vi.mock("virtual:drizzle-migrations.sql", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../db/migrations/0000_concerned_blade.sql", import.meta.url),
    "utf8",
  );
  return {
    default: [
      {
        idx: 0,
        when: 1780344361156,
        hash: "node-application-test",
        tag: "node-application-test",
        sql: source.split("--> statement-breakpoint").map((statement) => statement.trim()),
      },
    ],
  };
});

const payload = {
  kind: "country",
  parentId: null,
  name: "Chicago",
  slug: "chicago",
  motivation: "Serve the community",
  orgId: "org-1",
  accountId: "dao.sputnik-dao.near",
};

function user(id: string, role = "member") {
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

describe.sequential("node applications", () => {
  const runtime = createPluginRuntime({ registry: { proposals: { module: Plugin } } });
  let dataDir: string;
  let loaded: Awaited<ReturnType<typeof runtime.usePlugin<"proposals">>>;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "citynode-applications-"));
    loaded = await runtime.usePlugin("proposals", {
      variables: { privatePluginIds: [] },
      secrets: { PROPOSALS_DATABASE_URL: `pglite:${dataDir}` },
    });
  });

  afterAll(async () => {
    await runtime.shutdown();
    await rm(dataDir, { recursive: true, force: true });
  });

  function client(account: string, orgId = "org-1") {
    return loaded.createClient({
      userId: `user-${account}`,
      user: user(`user-${account}`),
      near: { primaryAccountId: account, linkedAccounts: [], hasNearAccount: true },
      organization: { activeOrganizationId: orgId },
    } as unknown as Parameters<typeof loaded.createClient>[0]);
  }

  it("binds the authenticated applicant and rejects identity or organization spoofing", async () => {
    await expect(
      client("alice.near").propose({
        pluginId: "node",
        entityId: "spoof",
        payload: { ...payload, slug: "spoof", submitterAccountId: "bob.near" },
      }),
    ).rejects.toThrow(/Applicant identity/);
    await expect(
      client("alice.near", "other-org").propose({
        pluginId: "node",
        entityId: "wrong-org",
        payload: { ...payload, slug: "wrong-org" },
      }),
    ).rejects.toThrow(/organization/);
    await expect(
      client("alice.near").propose({ pluginId: "node", entityId: "mismatch", payload }),
    ).rejects.toThrow(/Invalid community/);

    const result = await client("alice.near").propose({
      pluginId: "node",
      entityId: "chicago",
      payload,
    });
    expect(result.data.createdBy).toBe("alice.near");
    expect(result.data.payload).toMatchObject({ submitterAccountId: "alice.near" });
  });

  it("blocks duplicate pending submissions and another applicant's slug collision", async () => {
    await expect(
      client("alice.near").propose({
        pluginId: "node",
        entityId: "chicago",
        payload: { ...payload, motivation: "replace" },
      }),
    ).rejects.toThrow(/pending|review/);
    daoPolicy.members = ["alice.near", "bob.near"];
    await expect(
      client("bob.near").propose({
        pluginId: "node",
        entityId: "chicago",
        payload: { ...payload, submitterAccountId: "bob.near" },
      }),
    ).rejects.toThrow(/another applicant/);
    const mine = await client("alice.near").getMyNodeApplications();
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0]?.payload).toMatchObject({ motivation: "Serve the community" });
    expect((await client("bob.near").getMyNodeApplications()).data).toHaveLength(0);
  });

  it("requires an explicit DAO group member", async () => {
    daoPolicy.members = ["alice.near"];
    await expect(
      client("bob.near").propose({
        pluginId: "node",
        entityId: "boston",
        payload: { ...payload, slug: "boston" },
      }),
    ).rejects.toThrow(/explicit member/);
  });

  it("returns the same proposal for a repeated idempotency key", async () => {
    const request = {
      pluginId: "node",
      entityId: "milwaukee",
      payload: { ...payload, slug: "milwaukee" },
      idempotencyKey: "milwaukee-first-submission",
    };
    const first = await client("alice.near").propose(request);
    const retry = await client("alice.near").propose(request);
    expect(retry.data.id).toBe(first.data.id);
    expect(retry.data.submissionCount).toBe(1);
  });

  it("stores one submission when two requests race for the same slug", async () => {
    const request = {
      pluginId: "node",
      entityId: "detroit",
      payload: { ...payload, slug: "detroit" },
    };
    const outcomes = await Promise.allSettled([
      client("alice.near").propose(request),
      client("alice.near").propose(request),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const mine = await client("alice.near").getMyNodeApplications();
    expect(mine.data.find((proposal) => proposal.entityId === "detroit")?.submissionCount).toBe(1);
  });

  it("allows the original applicant to revise only after rejection", async () => {
    const current = (await client("alice.near").getMyNodeApplications()).data.find(
      (proposal) => proposal.entityId === "chicago",
    );
    const admin = loaded.createClient({ userId: "admin", user: user("admin", "admin") });
    await admin.reject({
      pluginId: "node",
      entityId: "chicago",
      expectedUpdatedAt: current!.updatedAt,
      reason: "More detail needed",
    });
    daoPolicy.members = ["alice.near", "bob.near"];
    await expect(
      client("bob.near").propose({
        pluginId: "node",
        entityId: "chicago",
        payload: { ...payload, submitterAccountId: "bob.near" },
      }),
    ).rejects.toThrow(/another applicant/);
    await expect(
      client("alice.near", "org-2").propose({
        pluginId: "node",
        entityId: "chicago",
        payload: { ...payload, orgId: "org-2" },
      }),
    ).rejects.toThrow(/another organization/);
    const revised = await client("alice.near").propose({
      pluginId: "node",
      entityId: "chicago",
      payload: { ...payload, motivation: "Expanded plan" },
    });
    expect(revised.data.reviewStatus).toBe("pending");
    expect(revised.data.payload).toMatchObject({ motivation: "Expanded plan" });
    expect(revised.data.createdBy).toBe("alice.near");
    expect(revised.data.submissionCount).toBe(2);

    const approved = await admin.approve({
      pluginId: "node",
      entityId: "chicago",
      expectedUpdatedAt: revised.data.updatedAt,
    });
    await admin.markApplyFailed({
      pluginId: "node",
      entityId: "chicago",
      expectedUpdatedAt: approved.data.updatedAt,
      error: "Provisioning failed",
    });
    const afterReload = await client("alice.near").getMyNodeApplications();
    expect(afterReload.data.find((proposal) => proposal.entityId === "chicago")).toMatchObject({
      reviewStatus: "approved",
      applyStatus: "failed",
      applyError: "Provisioning failed",
    });
  });
});
