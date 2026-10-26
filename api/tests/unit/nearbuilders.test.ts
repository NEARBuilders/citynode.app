import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { communityPath, createNearbuilders } from "../../src/services/nearbuilders";

const BASE = "https://nearbuilders.example";

function page(data: unknown[]) {
  return Response.json({ data, meta: { total: data.length, hasMore: false, nextCursor: null } });
}

function project(slug: string, cityNode: string, logoUrl: string | null = null) {
  return { kind: "project", slug, title: `Project ${slug}`, cityNode, logoUrl };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("communityPath", () => {
  const nodes: Record<string, { slug: string; parentId: string | null }> = {
    state: { slug: "Testland", parentId: null },
    city: { slug: "sample-city", parentId: "state" },
    orphan: { slug: "lost-city", parentId: "missing" },
    loop: { slug: "loop", parentId: "loop" },
  };
  const getNode = (id: string) => Effect.succeed(nodes[id] ?? null);

  it("joins parent slugs from the root down", async () => {
    expect(await Effect.runPromise(communityPath("city", getNode))).toBe("testland/sample-city");
    expect(await Effect.runPromise(communityPath("state", getNode))).toBe("testland");
  });

  it("returns null when the chain doesn't reach a root", async () => {
    expect(await Effect.runPromise(communityPath("orphan", getNode))).toBeNull();
    expect(await Effect.runPromise(communityPath("loop", getNode))).toBeNull();
    expect(await Effect.runPromise(communityPath("unknown", getNode))).toBeNull();
  });
});

describe("createNearbuilders", () => {
  it("keeps only https logos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) =>
        input.pathname === "/api/v1/projects"
          ? page([
              project("secure", "testland", "https://example.com/a.png"),
              project("plain", "testland", "http://example.com/b.png"),
            ])
          : page([]),
      ),
    );
    const result = await createNearbuilders(BASE).forPath("testland");
    expect(result.projects.items.map((item) => item.logoUrl)).toEqual([
      "https://example.com/a.png",
      null,
    ]);
  });

  it("counts the server total when every item is tagged, even if one fails to parse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) =>
        input.pathname === "/api/v1/projects"
          ? Response.json({
              data: [project("good", "testland"), { cityNode: "testland", title: 42 }],
              meta: { total: 30, hasMore: true, nextCursor: "next" },
            })
          : page([]),
      ),
    );
    const result = await createNearbuilders(BASE).forPath("testland");
    expect(result.projects).toMatchObject({ total: 30, items: [{ title: "Project good" }] });
  });

  it("shares one request between concurrent loads", async () => {
    const fetchMock = vi.fn(async () => page([]));
    vi.stubGlobal("fetch", fetchMock);
    const nearbuilders = createNearbuilders(BASE);
    await Promise.all([nearbuilders.forPath("testland"), nearbuilders.forPath("testland")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves the last good result when nearbuilders.org fails after the cache expires", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let down = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        if (down) return new Response("Bad gateway", { status: 502 });
        return input.pathname === "/api/v1/projects"
          ? page([project("kept", "testland")])
          : page([]);
      }),
    );
    const nearbuilders = createNearbuilders(BASE);
    expect((await nearbuilders.forPath("testland")).status).toBe("ok");

    down = true;
    now += 5 * 60 * 1000;
    expect(await nearbuilders.forPath("testland")).toMatchObject({
      status: "ok",
      projects: { items: [{ title: "Project kept" }] },
    });

    now += 2 * 60 * 60 * 1000;
    expect((await nearbuilders.forPath("testland")).status).toBe("unavailable");
  });

  it("waits 30 seconds before asking nearbuilders.org again after a failure", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi.fn(async () => new Response("Bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const nearbuilders = createNearbuilders(BASE);
    expect((await nearbuilders.forPath("testland")).status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now += 10 * 1000;
    expect((await nearbuilders.forPath("testland")).status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now += 30 * 1000;
    await nearbuilders.forPath("testland");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
