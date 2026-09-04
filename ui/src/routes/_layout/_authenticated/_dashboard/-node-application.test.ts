import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import {
  buildNodeProposalPayload,
  canSubmitNodeApplication,
  deriveNodeApplicationSlug,
  nodeApplicationSchema,
  parseNodeProposalPayload,
  proposeNodeApplication,
  readSessionNearAccountId,
} from "./-node-application";

describe("node application", () => {
  it("requires the correct parent for each node kind", () => {
    const base = {
      name: "Chicago",
      slug: "chicago",
      motivation: "I want to operate a node for the local community.",
    };

    expect(
      nodeApplicationSchema.safeParse({ ...base, kind: "country", parentId: null }).success,
    ).toBe(true);
    expect(
      nodeApplicationSchema.safeParse({ ...base, kind: "state", parentId: null }).success,
    ).toBe(false);
    expect(
      nodeApplicationSchema.safeParse({ ...base, kind: "city", parentId: "state-id" }).success,
    ).toBe(true);
  });

  it("derives the complete slug until the applicant edits it", () => {
    expect(deriveNodeApplicationSlug("Chicago", "", false)).toBe("chicago");
    expect(deriveNodeApplicationSlug("Chicago Heights", "chi", true)).toBe("chi");
  });

  it("builds the agreed node proposal payload", () => {
    expect(
      buildNodeProposalPayload(
        {
          kind: "city",
          parentId: "state-id",
          name: "Chicago",
          slug: "chicago",
          motivation: "I want to operate a node for the local community.",
        },
        { orgId: "org-1", accountId: "applicant.near" },
      ),
    ).toEqual({
      kind: "city",
      parentId: "state-id",
      name: "Chicago",
      slug: "chicago",
      orgId: "org-1",
      motivation: "I want to operate a node for the local community.",
      accountId: "applicant.near",
      submitterAccountId: "applicant.near",
    });
  });

  it("rejects malformed stored proposal payloads", () => {
    expect(() => parseNodeProposalPayload({ kind: "city", slug: "Chicago" })).toThrow();
  });

  it("reads the primary SIWN account from the session extension", () => {
    expect(
      readSessionNearAccountId({
        accounts: [
          { providerId: "email", accountId: "person@example.com" },
          { providerId: "siwn", accountId: "applicant.near:mainnet" },
        ],
      }),
    ).toBe("applicant.near");
    expect(readSessionNearAccountId({ accounts: [] })).toBeNull();
  });

  it("submits the exact node proposal envelope", async () => {
    const propose = vi.fn().mockResolvedValue({ data: { id: "proposal-id" } });
    await proposeNodeApplication(
      { proposals: { propose } } as unknown as ApiClient,
      {
        kind: "city",
        parentId: "state-id",
        name: "Chicago",
        slug: "chicago",
        motivation: "I want to operate a node for the local community.",
      },
      { orgId: "org-1", accountId: "applicant.near" },
    );

    expect(propose).toHaveBeenCalledWith({
      pluginId: "node",
      entityId: "chicago",
      source: "/apply",
      payload: {
        kind: "city",
        parentId: "state-id",
        name: "Chicago",
        slug: "chicago",
        orgId: "org-1",
        motivation: "I want to operate a node for the local community.",
        accountId: "applicant.near",
        submitterAccountId: "applicant.near",
      },
    });
  });

  it("requires identity, valid values, and an available hostname before submission", () => {
    const values = {
      kind: "country" as const,
      parentId: null,
      name: "Canada",
      slug: "canada",
      motivation: "I want to operate a country node.",
    };
    expect(
      canSubmitNodeApplication({
        values,
        orgId: "org-1",
        accountId: "applicant.near",
        hostnameAvailable: true,
      }),
    ).toBe(true);
    expect(
      canSubmitNodeApplication({
        values,
        orgId: null,
        accountId: "applicant.near",
        hostnameAvailable: true,
      }),
    ).toBe(false);
    expect(
      canSubmitNodeApplication({
        values,
        orgId: "org-1",
        accountId: null,
        hostnameAvailable: true,
      }),
    ).toBe(false);
    expect(
      canSubmitNodeApplication({
        values,
        orgId: "org-1",
        accountId: "applicant.near",
        hostnameAvailable: false,
      }),
    ).toBe(false);
  });
});
