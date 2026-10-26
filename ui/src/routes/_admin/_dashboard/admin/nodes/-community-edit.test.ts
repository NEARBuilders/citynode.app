import { describe, expect, it, vi } from "vitest";
import { emptyDiscoveryProfile } from "@/components/discovery/profile-fields";
import { communityDraftFrom, planCommunitySave, saveCommunityEdits } from "./-community-edit";

const nodeId = "8a1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

const node = {
  id: nodeId,
  name: "Testville",
  metadata: { description: "Internal note", population: 1200, tags: ["city"] },
} as unknown as Parameters<typeof communityDraftFrom>[0];

const profile = {
  ...emptyDiscoveryProfile(nodeId),
  summary: "Builders meeting every month",
  location: "Testville",
  channels: [{ label: "Telegram", url: "https://t.me/testville" }],
  published: true,
};

describe("community draft", () => {
  it("splits the admin note out of the metadata JSON", () => {
    const draft = communityDraftFrom(node, profile);
    expect(draft.name).toBe("Testville");
    expect(draft.description).toBe("Internal note");
    expect(JSON.parse(draft.metadata)).toEqual({ population: 1200, tags: ["city"] });
    expect(draft.profile).toBe(profile);
  });
});

describe("planning the merged save", () => {
  const initial = communityDraftFrom(node, profile);

  it("saves nothing when nothing changed", () => {
    expect(planCommunitySave(nodeId, initial, { ...initial })).toEqual({ ok: true });
  });

  it("saves only the details when only the name changed", () => {
    const plan = planCommunitySave(nodeId, initial, { ...initial, name: " Testville North " });
    expect(plan).toEqual({
      ok: true,
      node: {
        nodeId,
        name: "Testville North",
        metadata: { population: 1200, tags: ["city"], description: "Internal note" },
      },
    });
  });

  it("saves only the profile when only the profile changed", () => {
    const next = { ...profile, summary: "New summary" };
    expect(planCommunitySave(nodeId, initial, { ...initial, profile: next })).toEqual({
      ok: true,
      profile: next,
    });
  });

  it("saves both when details and profile changed", () => {
    const next = { ...profile, published: false };
    const plan = planCommunitySave(nodeId, initial, {
      ...initial,
      description: "",
      profile: next,
    });
    expect(plan).toEqual({
      ok: true,
      node: { nodeId, name: "Testville", metadata: { population: 1200, tags: ["city"] } },
      profile: next,
    });
  });

  it("flags a missing name", () => {
    expect(planCommunitySave(nodeId, initial, { ...initial, name: "  " })).toEqual({
      ok: false,
      field: "name",
      issue: "admin.community.nameRequired",
    });
  });

  it.each(["{broken", "[]", "null"])("flags invalid metadata %s", (metadata) => {
    expect(planCommunitySave(nodeId, initial, { ...initial, metadata })).toEqual({
      ok: false,
      field: "metadata",
      issue: "admin.community.metadataInvalid",
    });
  });

  it("flags profile links without a name or an http link", () => {
    const unnamed = { ...profile, channels: [{ label: " ", url: "https://t.me/x" }] };
    expect(planCommunitySave(nodeId, initial, { ...initial, profile: unnamed })).toMatchObject({
      ok: false,
      field: "profile",
      issue: "community.linkNameRequired",
    });
    const badUrl = { ...profile, channels: [{ label: "Chat", url: "t.me/x" }] };
    expect(planCommunitySave(nodeId, initial, { ...initial, profile: badUrl })).toMatchObject({
      ok: false,
      field: "profile",
      issue: "community.linkUrlRequired",
    });
  });

  it("leaves the profile alone when it could not be loaded", () => {
    const withoutProfile = communityDraftFrom(node, null);
    expect(
      planCommunitySave(nodeId, withoutProfile, { ...withoutProfile, name: "Renamed" }),
    ).toMatchObject({ ok: true, node: { name: "Renamed" } });
  });
});

describe("running the merged save", () => {
  const plan = {
    ok: true as const,
    node: { nodeId, name: "Testville", metadata: {} },
    profile,
  };

  it("sends the details and the profile and returns the saved profile", async () => {
    const saved = { ...profile, latitude: 10, longitude: 20 };
    const api = {
      updateNode: vi.fn().mockResolvedValue({}),
      saveDiscoveryProfile: vi.fn().mockResolvedValue(saved),
    };
    const result = await saveCommunityEdits(api as never, plan);
    expect(api.updateNode).toHaveBeenCalledWith(plan.node);
    expect(api.saveDiscoveryProfile).toHaveBeenCalledWith(profile);
    expect(result).toEqual({ savedProfile: saved });
  });

  it("reports which part failed when one save is rejected", async () => {
    const failure = new Error("forbidden");
    const api = {
      updateNode: vi.fn().mockRejectedValue(failure),
      saveDiscoveryProfile: vi.fn().mockResolvedValue(profile),
    };
    expect(await saveCommunityEdits(api as never, plan)).toEqual({
      nodeError: failure,
      savedProfile: profile,
    });
  });

  it("skips the calls a plan does not need", async () => {
    const api = { updateNode: vi.fn(), saveDiscoveryProfile: vi.fn() };
    expect(await saveCommunityEdits(api as never, { ok: true })).toEqual({});
    expect(api.updateNode).not.toHaveBeenCalled();
    expect(api.saveDiscoveryProfile).not.toHaveBeenCalled();
  });
});
