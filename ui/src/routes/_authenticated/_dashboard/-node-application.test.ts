import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import {
  buildNodeProposalPayload,
  canSubmitNodeApplication,
  generateNodeApplicationSlug,
  nodeApplicationSchema,
  parseNodeProposalPayload,
  proposeNodeApplication,
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
    expect(nodeApplicationSchema.safeParse({ ...base, kind: "city", parentId: null }).success).toBe(
      true,
    );
    expect(
      nodeApplicationSchema.safeParse({ ...base, kind: "country", parentId: "country-id" }).success,
    ).toBe(false);
  });

  it("always derives the slug from the node name", () => {
    expect(generateNodeApplicationSlug("Chicago")).toBe("chicago");
    expect(generateNodeApplicationSlug("Chicago Heights")).toBe("chicago-heights");
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
        {
          daoAccountId: "chicago.sputnik-dao.near",
          submitterAccountId: "applicant.near",
        },
      ),
    ).toEqual({
      kind: "city",
      parentId: "state-id",
      name: "Chicago",
      slug: "chicago",
      motivation: "I want to operate a node for the local community.",
      accountId: "chicago.sputnik-dao.near",
      submitterAccountId: "applicant.near",
    });
  });

  it("rejects malformed stored proposal payloads", () => {
    expect(() => parseNodeProposalPayload({ kind: "city", slug: "Chicago" })).toThrow();
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
      {
        daoAccountId: "chicago.sputnik-dao.near",
        submitterAccountId: "applicant.near",
      },
    );

    expect(propose).toHaveBeenCalledWith({
      pluginId: "node",
      entityId: "chicago",
      source: "/apply",
      idempotencyKey: expect.any(String),
      payload: {
        kind: "city",
        parentId: "state-id",
        name: "Chicago",
        slug: "chicago",
        motivation: "I want to operate a node for the local community.",
        accountId: "chicago.sputnik-dao.near",
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
        daoAccountId: "chicago.sputnik-dao.near",
        submitterAccountId: "applicant.near",
        hostnameAvailable: true,
        organizationSlugAvailable: true,
      }),
    ).toBe(true);
    expect(
      canSubmitNodeApplication({
        values,
        daoAccountId: null,
        submitterAccountId: "applicant.near",
        hostnameAvailable: true,
        organizationSlugAvailable: true,
      }),
    ).toBe(false);
    expect(
      canSubmitNodeApplication({
        values,
        daoAccountId: "chicago.sputnik-dao.near",
        submitterAccountId: null,
        hostnameAvailable: true,
        organizationSlugAvailable: true,
      }),
    ).toBe(false);
    expect(
      canSubmitNodeApplication({
        values,
        daoAccountId: "chicago.sputnik-dao.near",
        submitterAccountId: "applicant.near",
        hostnameAvailable: false,
        organizationSlugAvailable: true,
      }),
    ).toBe(false);
    expect(
      canSubmitNodeApplication({
        values,
        daoAccountId: "chicago.sputnik-dao.near",
        submitterAccountId: "applicant.near",
        hostnameAvailable: true,
        organizationSlugAvailable: false,
      }),
    ).toBe(false);
  });
});
