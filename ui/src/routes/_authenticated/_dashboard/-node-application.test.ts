import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import {
  buildNodeProposalPayload,
  canSubmitNodeApplication,
  nodeApplicationSchema,
  parseNodeProposalPayload,
  proposeNodeApplication,
} from "./-node-application";

const chicago = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "chicago",
  name: "Chicago",
};
const identity = {
  daoAccountId: "chicago.sputnik-dao.near",
  submitterAccountId: "applicant.near",
};
const values = { motivation: "I want to operate a node for the local community." };

describe("official application", () => {
  it("only asks the applicant for their motivation", () => {
    expect(nodeApplicationSchema.safeParse(values).success).toBe(true);
    expect(nodeApplicationSchema.safeParse({ motivation: " " }).success).toBe(false);
  });

  it("builds the payload from the chosen place", () => {
    expect(buildNodeProposalPayload(values, chicago, identity)).toEqual({
      placeId: chicago.id,
      name: "Chicago",
      slug: "chicago",
      motivation: values.motivation,
      accountId: "chicago.sputnik-dao.near",
      submitterAccountId: "applicant.near",
    });
  });

  it("still reads applications saved before the cutover", () => {
    expect(
      parseNodeProposalPayload({
        kind: "city",
        parentId: null,
        name: "Chicago",
        slug: "chicago",
        motivation: "Old application",
        accountId: "chicago.sputnik-dao.near",
      }).slug,
    ).toBe("chicago");
    expect(() => parseNodeProposalPayload({ slug: "Chicago" })).toThrow();
  });

  it("proposes for an active community without activating it again", async () => {
    const propose = vi.fn().mockResolvedValue({ data: { id: "proposal-id" } });
    const activateCommunity = vi.fn();
    await proposeNodeApplication(
      { proposals: { propose }, activateCommunity } as unknown as ApiClient,
      values,
      { ...chicago, activated: true },
      identity,
    );
    expect(activateCommunity).not.toHaveBeenCalled();
    expect(propose).toHaveBeenCalledWith({
      pluginId: "node",
      entityId: "chicago",
      source: "/apply",
      idempotencyKey: expect.any(String),
      payload: buildNodeProposalPayload(values, chicago, identity),
    });
  });

  it("activates the place before proposing when it has no community", async () => {
    const propose = vi.fn().mockResolvedValue({ data: { id: "proposal-id" } });
    const activateCommunity = vi.fn().mockResolvedValue({});
    await proposeNodeApplication(
      { proposals: { propose }, activateCommunity } as unknown as ApiClient,
      values,
      { ...chicago, activated: false },
      identity,
    );
    expect(activateCommunity).toHaveBeenCalledWith({ place: "chicago" });
    expect(activateCommunity.mock.invocationCallOrder[0]).toBeLessThan(
      propose.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not propose when activation fails", async () => {
    const propose = vi.fn();
    const activateCommunity = vi.fn().mockRejectedValue(new Error("Unknown place"));
    await expect(
      proposeNodeApplication(
        { proposals: { propose }, activateCommunity } as unknown as ApiClient,
        values,
        { ...chicago, activated: false },
        identity,
      ),
    ).rejects.toThrow("Unknown place");
    expect(propose).not.toHaveBeenCalled();
  });

  it("requires a place, a verified DAO and a NEAR account before submission", () => {
    const ready = {
      values,
      place: chicago,
      daoAccountId: "chicago.sputnik-dao.near",
      submitterAccountId: "applicant.near",
    };
    expect(canSubmitNodeApplication(ready)).toBe(true);
    expect(canSubmitNodeApplication({ ...ready, place: null })).toBe(false);
    expect(canSubmitNodeApplication({ ...ready, daoAccountId: null })).toBe(false);
    expect(canSubmitNodeApplication({ ...ready, submitterAccountId: null })).toBe(false);
    expect(canSubmitNodeApplication({ ...ready, submitting: true })).toBe(false);
  });
});
