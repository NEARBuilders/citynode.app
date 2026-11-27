import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AuthClient, backfillCommunityJoinCodes } from "@/lib/community-join-code";
import type { MissingJoinCode, NodesService } from "@/services/nodes";

const missing: MissingJoinCode[] = [
  {
    id: "node-lagos",
    orgId: "org-lagos",
    slug: "lagos",
    name: "Lagos",
    kind: "city",
    metadata: {},
  },
];

function nodesWithMissingCodes() {
  const listMissingJoinCodes = vi.fn(() => Effect.succeed(missing));
  const nodes = {
    listMissingJoinCodes,
    getById: () => Effect.succeed(null),
    attachJoinCodeIfMissing: () => Effect.succeed(false),
  } as unknown as NodesService;
  return { nodes, listMissingJoinCodes };
}

const failingClient = {
  createOnboardingCode: () => Promise.reject(new Error("auth is down")),
} as unknown as AuthClient;

let now = Date.now();

beforeEach(() => {
  now += 10 * 60_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("backfilling community join codes", () => {
  it("waits out the cooldown even when a community can't be repaired", async () => {
    const { nodes, listMissingJoinCodes } = nodesWithMissingCodes();

    await backfillCommunityJoinCodes(nodes, [failingClient]);
    await backfillCommunityJoinCodes(nodes, [failingClient]);
    await backfillCommunityJoinCodes(nodes, [failingClient]);

    expect(listMissingJoinCodes).toHaveBeenCalledTimes(1);
  });

  it("still lets a platform admin repair right after a visitor's run left gaps", async () => {
    const { nodes, listMissingJoinCodes } = nodesWithMissingCodes();

    await backfillCommunityJoinCodes(nodes, [failingClient]);
    await backfillCommunityJoinCodes(nodes, [failingClient], { platformAdmin: true });

    expect(listMissingJoinCodes).toHaveBeenCalledTimes(2);
  });

  it("cools down platform admins too once their own run leaves gaps", async () => {
    const { nodes, listMissingJoinCodes } = nodesWithMissingCodes();

    await backfillCommunityJoinCodes(nodes, [failingClient], { platformAdmin: true });
    await backfillCommunityJoinCodes(nodes, [failingClient], { platformAdmin: true });
    await backfillCommunityJoinCodes(nodes, [failingClient]);

    expect(listMissingJoinCodes).toHaveBeenCalledTimes(1);
  });

  it("runs again once the cooldown is over", async () => {
    const { nodes, listMissingJoinCodes } = nodesWithMissingCodes();

    await backfillCommunityJoinCodes(nodes, [failingClient]);
    vi.setSystemTime(now + 61_000);
    await backfillCommunityJoinCodes(nodes, [failingClient]);

    expect(listMissingJoinCodes).toHaveBeenCalledTimes(2);
  });
});
