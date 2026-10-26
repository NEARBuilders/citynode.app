import { describe, expect, it, vi } from "vitest";
import {
  CommunitySaveError,
  filterNodeRows,
  parseNodeDetailSearch,
  parseNodeDetailTab,
  parseNodeMetadata,
  saveCommunity,
} from "./-node-management";

describe("node metadata editing", () => {
  it("preserves arbitrary JSON data while saving the description field", () => {
    expect(
      parseNodeMetadata(
        '{"population":2700000,"tags":["city"],"location":{"lat":41.8}}',
        " Chicago ",
      ),
    ).toEqual({
      population: 2700000,
      tags: ["city"],
      location: { lat: 41.8 },
      description: "Chicago",
    });
  });

  it.each([
    "null",
    "[]",
    "42",
    '"text"',
    "{broken",
  ])("rejects invalid or non-object metadata: %s", (raw) => {
    expect(() => parseNodeMetadata(raw, "")).toThrow();
  });

  it("uses the description field to update or remove metadata.description", () => {
    expect(parseNodeMetadata('{"description":"old","population":1}', "new")).toEqual({
      description: "new",
      population: 1,
    });
    expect(parseNodeMetadata('{"description":"old","population":1}', " ")).toEqual({
      population: 1,
    });
  });
});

describe("node list search", () => {
  const rows = [
    { node: { name: "Chicago", slug: "chicago" }, parent: { name: "United States" } },
    { node: { name: "Lahore", slug: "lhr" }, parent: { name: "Pakistan" } },
    { node: { name: "Pakistan", slug: "pakistan" }, parent: undefined },
  ];

  it("returns every row for an empty query", () => {
    expect(filterNodeRows(rows, "  ")).toHaveLength(3);
  });

  it("matches name, slug and parent without case sensitivity", () => {
    expect(filterNodeRows(rows, "CHI").map((row) => row.node.name)).toEqual(["Chicago"]);
    expect(filterNodeRows(rows, "lhr").map((row) => row.node.name)).toEqual(["Lahore"]);
    expect(filterNodeRows(rows, "pakistan").map((row) => row.node.name)).toEqual([
      "Lahore",
      "Pakistan",
    ]);
  });
});

describe("node detail tabs", () => {
  it.each(["overview", "validators", "management", "domains"])("accepts %s", (tab) => {
    expect(parseNodeDetailTab(tab)).toBe(tab);
  });

  it("opens Node management from old sequence links", () => {
    expect(parseNodeDetailTab("sequence")).toBe("management");
  });

  it.each([undefined, "", "bindings", "profile", 3])("ignores %s", (tab) => {
    expect(parseNodeDetailTab(tab)).toBeUndefined();
  });

  it("opens the editor for edit links and old profile tab links", () => {
    expect(parseNodeDetailSearch({ edit: true })).toEqual({ tab: undefined, edit: true });
    expect(parseNodeDetailSearch({ edit: "true", tab: "domains" })).toEqual({
      tab: "domains",
      edit: true,
    });
    expect(parseNodeDetailSearch({ tab: "profile" })).toEqual({ tab: undefined, edit: true });
    expect(parseNodeDetailSearch({ edit: "no" })).toEqual({ tab: undefined });
  });
});

describe("saveCommunity", () => {
  const profile = { nodeId: "n1", summary: "Hack nights" };
  const draft = {
    name: " Chicago ",
    description: "Admin note",
    metadata: '{"poolAccountId":"chicago.poolv1.near"}',
    profile,
  };

  function api() {
    return {
      updateNode: vi.fn(async (input: unknown) => input),
      saveDiscoveryProfile: vi.fn(async (input: typeof profile) => input),
    };
  }

  it("saves node details and then the profile", async () => {
    const client = api();
    await expect(saveCommunity(client, "n1", draft)).resolves.toEqual({
      node: {
        nodeId: "n1",
        name: "Chicago",
        metadata: { poolAccountId: "chicago.poolv1.near", description: "Admin note" },
      },
      profile,
    });
    expect(client.updateNode.mock.invocationCallOrder[0]).toBeLessThan(
      client.saveDiscoveryProfile.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("saves only node details for a community without a profile", async () => {
    const client = api();
    await expect(saveCommunity(client, "n1", { ...draft, profile: null })).resolves.toMatchObject({
      profile: null,
    });
    expect(client.saveDiscoveryProfile).not.toHaveBeenCalled();
  });

  it("saves nothing when the metadata is invalid", async () => {
    const client = api();
    await expect(saveCommunity(client, "n1", { ...draft, metadata: "[]" })).rejects.toThrow();
    expect(client.updateNode).not.toHaveBeenCalled();
    expect(client.saveDiscoveryProfile).not.toHaveBeenCalled();
  });

  it("reports which part failed", async () => {
    const detailsFail = api();
    detailsFail.updateNode.mockRejectedValueOnce(new Error("forbidden"));
    const details = await saveCommunity(detailsFail, "n1", draft).catch((error) => error);
    expect(details).toBeInstanceOf(CommunitySaveError);
    expect(details).toMatchObject({ stage: "details" });
    expect(detailsFail.saveDiscoveryProfile).not.toHaveBeenCalled();

    const profileFail = api();
    profileFail.saveDiscoveryProfile.mockRejectedValueOnce(new Error("bad link"));
    await expect(saveCommunity(profileFail, "n1", draft)).rejects.toMatchObject({
      stage: "profile",
    });
  });
});
