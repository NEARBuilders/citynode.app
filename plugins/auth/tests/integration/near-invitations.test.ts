import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../../src/db/schema";
import {
  createTestHandlers,
  createTestOrg,
  createTestServices,
  createTestUser,
  type TestUser,
} from "../helpers";

let services: Awaited<ReturnType<typeof createTestServices>>;

beforeAll(async () => {
  services = await createTestServices();
}, 30000);

afterAll(async () => {
  await services.driver.close();
}, 30000);

function walletId() {
  return `wallet-${crypto.randomUUID().slice(0, 8)}.near`;
}

async function linkWallet(user: TestUser, accountId: string) {
  await services.services.db.insert(schema.nearAccount).values({
    id: crypto.randomUUID(),
    userId: user.userId,
    accountId,
    network: "mainnet",
    publicKey: "ed25519:test",
    isPrimary: true,
    createdAt: new Date(),
  });
}

async function walletInvitation(options: { withTeam?: boolean } = {}) {
  const owner = await createTestUser(services.services);
  const org = await createTestOrg(services.services, owner.userId);
  const handlers = createTestHandlers(services.services);
  const team = options.withTeam
    ? await handlers.teams.createTeam({
        input: { name: "Node Operator", organizationId: org.id, areas: ["node-operations"] },
        context: { reqHeaders: owner.reqHeaders },
      })
    : null;
  const nearAccountId = walletId();
  const invitation = await handlers.invitations.inviteMember({
    input: {
      nearAccountId,
      role: "member",
      organizationId: org.id,
      ...(team ? { teamId: team.id } : {}),
    },
    context: { reqHeaders: owner.reqHeaders },
  });
  return { owner, org, team, handlers, nearAccountId, invitation };
}

describe("NEAR-account invitations", () => {
  it("creates a wallet invitation without sending an email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { owner, org, handlers, nearAccountId, invitation } = await walletInvitation();

      expect(invitation).toMatchObject({ nearAccountId, status: "pending", role: "member" });
      expect(log.mock.calls.flat().join("\n")).not.toContain("Invitation to join");
      const listed = await handlers.invitations.listInvitations({
        input: { organizationId: org.id },
        context: { reqHeaders: owner.reqHeaders },
      });
      expect(listed).toEqual([expect.objectContaining({ id: invitation.id, nearAccountId })]);
    } finally {
      log.mockRestore();
    }
  });

  it("rejects malformed account ids and ambiguous invitees", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    for (const input of [
      { nearAccountId: "Not A Wallet!" },
      { nearAccountId: "alice.near", email: "alice@example.com" },
      {},
    ]) {
      await expect(
        handlers.invitations.inviteMember({
          input: { ...input, role: "member", organizationId: org.id },
          context: { reqHeaders: owner.reqHeaders },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("accepts with the invited wallet, joining the organization and team workspace", async () => {
    const { org, team, handlers, nearAccountId, invitation } = await walletInvitation({
      withTeam: true,
    });
    const invitee = await createTestUser(services.services);
    await linkWallet(invitee, nearAccountId);

    await handlers.invitations.acceptNearInvitation({
      input: { invitationId: invitation.id },
      context: { reqHeaders: invitee.reqHeaders },
    });

    const context = await handlers.session.getContext({
      context: { reqHeaders: invitee.reqHeaders },
    });
    expect(context.organization.activeOrganizationId).toBe(org.id);
    expect(context.organization.member?.role).toBe("member");
    expect(context.organization.activeTeamId).toBe(team?.id);
    expect(context.organization.teams).toEqual([
      { id: team?.id, name: "Node Operator", areas: ["node-operations"] },
    ]);
  });

  it("rejects acceptance from a different wallet", async () => {
    const { handlers, invitation } = await walletInvitation();
    const impostor = await createTestUser(services.services);
    await linkWallet(impostor, walletId());

    await expect(
      handlers.invitations.acceptNearInvitation({
        input: { invitationId: invitation.id },
        context: { reqHeaders: impostor.reqHeaders },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects expired and already-accepted invitations", async () => {
    const { handlers, nearAccountId, invitation } = await walletInvitation();
    const invitee = await createTestUser(services.services);
    await linkWallet(invitee, nearAccountId);
    await handlers.invitations.acceptNearInvitation({
      input: { invitationId: invitation.id },
      context: { reqHeaders: invitee.reqHeaders },
    });

    await expect(
      handlers.invitations.acceptNearInvitation({
        input: { invitationId: invitation.id },
        context: { reqHeaders: invitee.reqHeaders },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const expired = await walletInvitation();
    await linkWallet(invitee, expired.nearAccountId);
    await services.services.db
      .update(schema.invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.invitation.id, expired.invitation.id));
    await expect(
      handlers.invitations.acceptNearInvitation({
        input: { invitationId: expired.invitation.id },
        context: { reqHeaders: invitee.reqHeaders },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("cannot be accepted through the email acceptance flow", async () => {
    const { handlers, nearAccountId, invitation } = await walletInvitation();
    const invitee = await createTestUser(services.services, {
      email: `${nearAccountId}@near-wallet.invalid`,
    });

    await expect(
      handlers.invitations.acceptInvitation({
        input: { invitationId: invitation.id },
        context: { reqHeaders: invitee.reqHeaders },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("surfaces pending wallet invitations once the wallet is linked", async () => {
    const { org, nearAccountId, invitation, handlers } = await walletInvitation();
    const invitee = await createTestUser(services.services);

    const before = await handlers.invitations.listUserInvitations({
      context: { reqHeaders: invitee.reqHeaders },
    });
    expect(before).toEqual([]);

    await linkWallet(invitee, nearAccountId);
    const after = await handlers.invitations.listUserInvitations({
      context: { reqHeaders: invitee.reqHeaders },
    });
    expect(after).toEqual([
      expect.objectContaining({
        id: invitation.id,
        nearAccountId,
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
      }),
    ]);
  });

  it("surfaces wallet invitations for users without a verified email", async () => {
    const { org, nearAccountId, invitation, handlers } = await walletInvitation();
    const invitee = await createTestUser(services.services);
    await services.services.db
      .update(schema.user)
      .set({ emailVerified: false })
      .where(eq(schema.user.id, invitee.userId));
    await linkWallet(invitee, nearAccountId);

    const listed = await handlers.invitations.listUserInvitations({
      context: { reqHeaders: invitee.reqHeaders },
    });
    expect(listed).toEqual([
      expect.objectContaining({
        id: invitation.id,
        nearAccountId,
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
      }),
    ]);
  });

  it("resolves the claimable link only for the invited wallet", async () => {
    const { org, nearAccountId, invitation, handlers } = await walletInvitation();
    const invitee = await createTestUser(services.services);
    const stranger = await createTestUser(services.services);
    await linkWallet(invitee, nearAccountId);

    const claimed = await handlers.invitations.getInvitation({
      input: { id: invitation.id },
      context: { reqHeaders: invitee.reqHeaders },
    });
    expect(claimed).toMatchObject({
      id: invitation.id,
      nearAccountId,
      organizationName: org.name,
      organizationSlug: org.slug,
    });
    const hidden = await handlers.invitations.getInvitation({
      input: { id: invitation.id },
      context: { reqHeaders: stranger.reqHeaders },
    });
    expect(hidden).toBeNull();
  });

  it("can be declined by the invited wallet and canceled by the organization", async () => {
    const declined = await walletInvitation();
    const invitee = await createTestUser(services.services);
    await linkWallet(invitee, declined.nearAccountId);
    await declined.handlers.invitations.rejectNearInvitation({
      input: { invitationId: declined.invitation.id },
      context: { reqHeaders: invitee.reqHeaders },
    });
    expect(
      await declined.handlers.invitations.listUserInvitations({
        context: { reqHeaders: invitee.reqHeaders },
      }),
    ).toEqual([]);

    const canceled = await walletInvitation();
    await canceled.handlers.invitations.cancelInvitation({
      input: { invitationId: canceled.invitation.id },
      context: { reqHeaders: canceled.owner.reqHeaders },
    });
    const listed = await canceled.handlers.invitations.listInvitations({
      input: { organizationId: canceled.org.id },
      context: { reqHeaders: canceled.owner.reqHeaders },
    });
    expect(listed).toEqual([
      expect.objectContaining({ id: canceled.invitation.id, status: "canceled" }),
    ]);
  });
});
