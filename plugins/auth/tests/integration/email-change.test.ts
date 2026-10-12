import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthInstance } from "../../src/auth-instance";
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

const id = () => crypto.randomUUID().slice(0, 8);

async function placeholderUser(): Promise<TestUser> {
  const user = await createTestUser(services.services, {
    email: `passkey-${id()}@passkey.local`,
  });
  await services.services.db
    .update(schema.user)
    .set({ emailVerified: false })
    .where(eq(schema.user.id, user.userId));
  return user;
}

function requestEmailChange(user: TestUser, newEmail: string) {
  return services.services.auth.api.requestEmailChangeEmailOTP({
    headers: user.headers,
    body: { newEmail },
  });
}

function confirmEmailChange(user: TestUser, newEmail: string, otp: string) {
  return services.services.auth.api.changeEmailEmailOTP({
    headers: user.headers,
    body: { newEmail, otp },
  });
}

function codeSentTo(email: string) {
  const message = services.outbox.findLast((sent) => sent.to === email);
  const code = message?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`no confirmation code was sent to ${email}`);
  return code;
}

async function storedUser(userId: string) {
  return services.services.db.query.user.findFirst({ where: eq(schema.user.id, userId) });
}

async function membership(organizationId: string, userId: string) {
  return services.services.db.query.member.findFirst({
    where: and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)),
  });
}

async function inviteTo(email: string) {
  const owner = await createTestUser(services.services);
  const org = await createTestOrg(services.services, owner.userId);
  const invite = await createTestHandlers(services.services).invitations.inviteMember({
    input: { email, role: "member", organizationId: org.id },
    context: { reqHeaders: owner.reqHeaders },
  });
  return { org, invite };
}

function acceptInvite(user: TestUser, invitationId: string) {
  return createTestHandlers(services.services).invitations.acceptInvitation({
    input: { invitationId },
    context: { reqHeaders: user.reqHeaders },
  });
}

describe("adding an email address", () => {
  it("sends the code to the new address and keeps the account's email until it is entered", async () => {
    const claimant = await placeholderUser();
    const victim = `victim-${id()}@example.com`;
    const { org, invite } = await inviteTo(victim);

    await requestEmailChange(claimant, victim);

    expect(services.outbox.findLast((sent) => sent.to === victim)?.subject).toBe(
      "Your email confirmation code",
    );
    const user = await storedUser(claimant.userId);
    expect(user?.email).toBe(claimant.email);
    expect(user?.emailVerified).toBe(false);
    await expect(acceptInvite(claimant, invite.id)).rejects.toThrow();
    expect(await membership(org.id, claimant.userId)).toBeUndefined();
  });

  it("verifies the address once the code from it is entered, and the invite can then be accepted", async () => {
    const owner = await placeholderUser();
    const address = `owner-${id()}@example.com`;
    const { org, invite } = await inviteTo(address);

    await requestEmailChange(owner, address);
    await confirmEmailChange(owner, address, codeSentTo(address));

    const user = await storedUser(owner.userId);
    expect(user?.email).toBe(address);
    expect(user?.emailVerified).toBe(true);
    await expect(acceptInvite(owner, invite.id)).resolves.toEqual({ success: true });
    expect((await membership(org.id, owner.userId))?.role).toBe("member");
  });

  it("rejects a wrong code and leaves the account's email alone", async () => {
    const user = await placeholderUser();
    const address = `wrong-${id()}@example.com`;

    await requestEmailChange(user, address);
    const code = codeSentTo(address);
    const wrong = code === "000000" ? "111111" : "000000";

    await expect(confirmEmailChange(user, address, wrong)).rejects.toThrow(/Invalid OTP/);
    const stored = await storedUser(user.userId);
    expect(stored?.email).toBe(user.email);
    expect(stored?.emailVerified).toBe(false);
  });

  it("rejects an expired code", async () => {
    const user = await placeholderUser();
    const address = `expired-${id()}@example.com`;

    await requestEmailChange(user, address);
    const code = codeSentTo(address);
    await services.services.db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.verification.identifier, `change-email-otp-${user.email}-${address}`));

    await expect(confirmEmailChange(user, address, code)).rejects.toThrow(/OTP expired/);
    expect((await storedUser(user.userId))?.email).toBe(user.email);
  });

  it("does not let a pending claim stop the real owner from using the address", async () => {
    const squatter = await placeholderUser();
    const realOwner = await placeholderUser();
    const contested = `contested-${id()}@example.com`;
    const signUpAddress = `signup-${id()}@example.com`;

    await requestEmailChange(squatter, contested);
    await requestEmailChange(squatter, signUpAddress);

    await requestEmailChange(realOwner, contested);
    await confirmEmailChange(realOwner, contested, codeSentTo(contested));
    expect((await storedUser(realOwner.userId))?.email).toBe(contested);

    const signedUp = await createTestUser(services.services, { email: signUpAddress });
    expect((await storedUser(signedUp.userId))?.email).toBe(signUpAddress);

    expect((await storedUser(squatter.userId))?.email).toBe(squatter.email);
  });

  it("keeps an account's verified real email from being swapped", async () => {
    const user = await createTestUser(services.services);

    await expect(requestEmailChange(user, `other-${id()}@example.com`)).rejects.toThrow(
      /already verified/,
    );
  });
});

describe("email code endpoints", () => {
  it("does not expose email-code sign-in, password reset or free-form verification", async () => {
    for (const path of [
      "/sign-in/email-otp",
      "/email-otp/send-verification-otp",
      "/email-otp/verify-email",
      "/email-otp/request-password-reset",
      "/forget-password/email-otp",
    ]) {
      const response = await services.services.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `probe-${id()}@example.com`, type: "sign-in", otp: "1" }),
        }),
      );
      expect(response.status, path).toBe(404);
    }
  });
});

describe("without an email provider", () => {
  function authWithoutProvider() {
    return createAuthInstance(
      {
        secret: process.env.BETTER_AUTH_SECRET!,
        baseUrl: "http://localhost:3000",
        siwn: { recipient: "test.near" },
      },
      services.services.db,
    );
  }

  it("saves the address straight away but unverified, with no code step", async () => {
    const auth = authWithoutProvider();
    const user = await placeholderUser();
    const address = `noprovider-${id()}@example.com`;
    const sentBefore = services.outbox.length;

    const result = await auth.api.requestEmailChangeEmailOTP({
      headers: user.headers,
      body: { newEmail: address },
    });

    expect(result).toEqual({ success: true, verificationRequired: false });
    const stored = await storedUser(user.userId);
    expect(stored?.email).toBe(address);
    expect(stored?.emailVerified).toBe(false);
    expect(services.outbox.length).toBe(sentBefore);
    await expect(
      auth.api.changeEmailEmailOTP({
        headers: user.headers,
        body: { newEmail: `other-${id()}@example.com`, otp: "123456" },
      }),
    ).rejects.toThrow(/No confirmation code was sent/);
  });

  it("does not let the unverified address accept an invitation sent to it", async () => {
    const auth = authWithoutProvider();
    const user = await placeholderUser();
    const address = `unproven-${id()}@example.com`;
    const { org, invite } = await inviteTo(address);

    await auth.api.requestEmailChangeEmailOTP({
      headers: user.headers,
      body: { newEmail: address },
    });

    expect((await storedUser(user.userId))?.email).toBe(address);
    await expect(acceptInvite(user, invite.id)).rejects.toThrow();
    expect(await membership(org.id, user.userId)).toBeUndefined();
  });

  it("gives the same answer for an address another account holds, and changes neither account", async () => {
    const auth = authWithoutProvider();
    const holderAddress = `holder-${id()}@example.com`;
    const holder = await createTestUser(services.services, { email: holderAddress });
    const user = await placeholderUser();

    const result = await auth.api.requestEmailChangeEmailOTP({
      headers: user.headers,
      body: { newEmail: holderAddress },
    });

    expect(result).toEqual({ success: true, verificationRequired: false });
    expect((await storedUser(user.userId))?.email).toBe(user.email);
    const storedHolder = await storedUser(holder.userId);
    expect(storedHolder?.email).toBe(holderAddress);
    expect(storedHolder?.emailVerified).toBe(true);
  });

  it("still keeps an account's verified real email from being swapped", async () => {
    const auth = authWithoutProvider();
    const user = await createTestUser(services.services);

    await expect(
      auth.api.requestEmailChangeEmailOTP({
        headers: user.headers,
        body: { newEmail: `swap-${id()}@example.com` },
      }),
    ).rejects.toThrow(/already verified/);
  });
});

describe("accepting an email invitation", () => {
  it("requires the matching address to be verified", async () => {
    const address = `unverified-${id()}@example.com`;
    const invitee = await createTestUser(services.services, { email: address });
    await services.services.db
      .update(schema.user)
      .set({ emailVerified: false })
      .where(eq(schema.user.id, invitee.userId));
    const { org, invite } = await inviteTo(address);

    await expect(acceptInvite(invitee, invite.id)).rejects.toThrow();
    expect(await membership(org.id, invitee.userId)).toBeUndefined();
  });
});
