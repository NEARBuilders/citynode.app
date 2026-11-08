import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { daoContext, getPluginClient, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

const ORG = "community-builders-org";
const NB = "https://nearbuilders.org";

function builder(nearAccount: string, cityNode: string | null, name: string | null = null) {
  return {
    id: `bld_${nearAccount}`,
    nearAccount,
    userId: null,
    name,
    bio: null,
    skills: [],
    location: null,
    links: null,
    cityNode,
    withdrawnAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function project(slug: string, cityNode: string | null, visibility = "public") {
  return {
    id: `proj_${slug}`,
    ownerId: "owner.near",
    organizationId: null,
    kind: "project",
    slug,
    title: `Project ${slug}`,
    description: `About ${slug}`,
    content: null,
    status: "active",
    visibility,
    repository: null,
    domain: null,
    logoUrl: "https://example.com/logo.png",
    cityNode,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function stubNearbuilders(
  respond: (url: URL) => Response | Promise<Response>,
  requests: URL[] = [],
) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== NB) return realFetch(input, init);
    requests.push(url);
    return respond(url);
  });
  return requests;
}

async function spawnNested() {
  const owner = await getPluginClient(daoContext("builders-owner", ORG, "builders-owner.near"));
  const suffix = crypto.randomUUID().slice(0, 8);
  const state = await owner.spawnNode({
    kind: "state",
    slug: `testland-${suffix}`,
    name: "Testland",
    parentId: null,
  });
  const city = await owner.spawnNode({
    kind: "city",
    slug: `sample-city-${suffix}`,
    name: "Sample City",
    parentId: state.id,
  });
  return { state, city, path: `${state.slug}/${city.slug}` };
}

describe("community builders from nearbuilders.org", () => {
  beforeAll(async () => {
    await getPluginClient();
  }, 30_000);
  afterEach(() => vi.unstubAllGlobals());
  afterAll(teardown);

  it("queries a nested community by its path and keeps only items tagged with it", async () => {
    const { city, path } = await spawnNested();
    const requests = stubNearbuilders((url) =>
      url.pathname === "/api/v1/builders"
        ? Response.json({
            data: [
              builder("alice.testnet", path, "Alice Example"),
              builder("bob.testnet", path),
              builder("other.testnet", "elsewhere"),
            ],
            meta: { total: 3, hasMore: false, nextCursor: null },
          })
        : Response.json({
            data: [
              project("demo-app", path),
              project("hidden-app", path, "private"),
              project("far-app", null),
            ],
            meta: { total: 3, hasMore: false, nextCursor: null },
          }),
    );

    const client = await getPluginClient();
    const result = await client.getCommunityBuilders({ nodeId: city.id });

    expect(requests.map((url) => url.searchParams.get("cityNode"))).toEqual([path, path]);
    expect(result).toMatchObject({
      path,
      status: "ok",
      builders: {
        total: 2,
        url: `${NB}/builders`,
        items: [
          {
            nearAccount: "alice.testnet",
            name: "Alice Example",
            url: `${NB}/builders/alice.testnet`,
          },
          { nearAccount: "bob.testnet", name: null, url: `${NB}/builders/bob.testnet` },
        ],
      },
      projects: {
        total: 1,
        items: [
          {
            title: "Project demo-app",
            description: "About demo-app",
            logoUrl: "https://example.com/logo.png",
            url: `${NB}/projects/project/demo-app`,
          },
        ],
      },
    });
  });

  it("uses the slug alone for a top-level community and shows nothing when the filter is ignored", async () => {
    const { state } = await spawnNested();
    stubNearbuilders((url) =>
      Response.json({
        data:
          url.pathname === "/api/v1/builders"
            ? [builder("someone.testnet", null)]
            : [project("untagged", null)],
        meta: { total: 40, hasMore: true, nextCursor: "next" },
      }),
    );

    const client = await getPluginClient();
    const result = await client.getCommunityBuilders({ nodeId: state.id });

    expect(result).toMatchObject({
      path: state.slug,
      status: "ok",
      builders: { items: [], total: 0 },
      projects: { items: [], total: 0 },
    });
  });

  it("reports nearbuilders.org as unavailable instead of failing", async () => {
    const { city } = await spawnNested();
    stubNearbuilders(() => new Response("Bad gateway", { status: 502 }));

    const client = await getPluginClient();
    const result = await client.getCommunityBuilders({ nodeId: city.id });

    expect(result).toMatchObject({ status: "unavailable", builders: { items: [] } });
  });

  it("returns null for an unknown community", async () => {
    const client = await getPluginClient();
    expect(await client.getCommunityBuilders({ nodeId: crypto.randomUUID() })).toBeNull();
  });
});
