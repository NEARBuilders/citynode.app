import { afterAll, describe, expect, it } from "vitest";
import { getPluginClient, orgContext, teardown } from "../setup";

afterAll(teardown);

function memberWithTeam(userId: string, org: string, areas: string[]) {
  const base = orgContext(userId, org, "member");
  return {
    ...base,
    organization: {
      ...(base.organization as Record<string, unknown>),
      teams: [{ id: `team-${userId}`, name: "Community", areas }],
      activeTeamId: null,
    },
  };
}

function community() {
  const id = crypto.randomUUID().slice(0, 8);
  return { id, org: `onboarding-links-${id}` };
}

describe("onboarding links", () => {
  it("lets an organizer create a link that counts scans and redirects", async () => {
    const { id, org } = community();
    const owner = await getPluginClient(orgContext(`owner-${id}`, org));

    const link = await owner.createOnboardingLink({
      organizationId: org,
      name: "  Telegram group ",
      destination: "https://t.me/citynode",
    });
    expect(link).toMatchObject({
      name: "Telegram group",
      destination: "https://t.me/citynode",
      enabled: true,
      visitCount: 0,
      lastVisitedAt: null,
    });
    expect(link.slug).toMatch(/^[a-z0-9]{8}$/);

    const visitor = await getPluginClient();
    expect(await visitor.openOnboardingLink({ slug: link.slug })).toEqual({
      destination: "https://t.me/citynode",
    });
    await visitor.openOnboardingLink({ slug: link.slug });

    const [listed] = await owner.listOnboardingLinks({ organizationId: org });
    expect(listed).toMatchObject({ id: link.id, visitCount: 2 });
    expect(listed?.lastVisitedAt).not.toBeNull();
  });

  it("repoints a printed link and stops counting it once it's turned off", async () => {
    const { id, org } = community();
    const organizer = await getPluginClient(memberWithTeam(`organizer-${id}`, org, ["events"]));
    const link = await organizer.createOnboardingLink({
      organizationId: org,
      name: "Sign-up form",
      destination: "https://forms.gle/old",
    });

    const repointed = await organizer.updateOnboardingLink({
      linkId: link.id,
      organizationId: org,
      destination: "https://lu.ma/new",
    });
    expect(repointed).toMatchObject({ slug: link.slug, destination: "https://lu.ma/new" });

    const visitor = await getPluginClient();
    expect(await visitor.openOnboardingLink({ slug: link.slug })).toEqual({
      destination: "https://lu.ma/new",
    });

    await organizer.updateOnboardingLink({ linkId: link.id, organizationId: org, enabled: false });
    await expect(visitor.openOnboardingLink({ slug: link.slug })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const [listed] = await organizer.listOnboardingLinks({ organizationId: org });
    expect(listed).toMatchObject({ enabled: false, visitCount: 1 });
  });

  it("refuses destinations that aren't web addresses", async () => {
    const { id, org } = community();
    const owner = await getPluginClient(orgContext(`owner-${id}`, org));
    for (const destination of ["javascript:alert(1)", "data:text/html,hi", "t.me/x"]) {
      await expect(
        owner.createOnboardingLink({ organizationId: org, name: "Bad", destination }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("keeps links to the community's organizers", async () => {
    const { id, org } = community();
    const owner = await getPluginClient(orgContext(`owner-${id}`, org));
    const link = await owner.createOnboardingLink({
      organizationId: org,
      name: "Telegram group",
      destination: "https://t.me/citynode",
    });

    const member = await getPluginClient(memberWithTeam(`member-${id}`, org, ["finance"]));
    await expect(member.listOnboardingLinks({ organizationId: org })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      member.createOnboardingLink({
        organizationId: org,
        name: "Mine",
        destination: "https://example.com",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const otherOrgOwner = await getPluginClient(orgContext(`other-${id}`, `${org}-other`));
    await expect(otherOrgOwner.listOnboardingLinks({ organizationId: org })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      otherOrgOwner.updateOnboardingLink({
        linkId: link.id,
        organizationId: `${org}-other`,
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const visitor = await getPluginClient();
    await expect(visitor.listOnboardingLinks({ organizationId: org })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(visitor.openOnboardingLink({ slug: "unknown1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
