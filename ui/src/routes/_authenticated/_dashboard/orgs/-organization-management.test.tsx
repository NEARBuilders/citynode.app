// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthClient, Organization } from "@/app";
import { Tabs } from "@/components";
import { ApiKeysTab, type OrganizationApiKey } from "./-api-keys-tab";
import { InvitationsTab } from "./-invitations-tab";
import { MembersTab } from "./-members-tab";
import { useOrganizationApiKeyActions } from "./-organization-api-keys";
import { OrganizationOverview } from "./-organization-overview";
import { orgApiKeysQueryKey } from "./-organization-query-keys";

const ORG_ID = "org-management-1";
const USER_ID = "user-management-1";

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.success(...args),
    error: (...args: unknown[]) => mocks.error(...args),
  },
}));

const organization = {
  id: ORG_ID,
  name: "City Nodes",
  slug: "city-nodes",
  logo: null,
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
} as Organization;

const members = [
  {
    id: "member-self",
    userId: USER_ID,
    role: "owner",
    user: { id: USER_ID, name: "Owner", email: "owner@example.com" },
  },
  {
    id: "member-other",
    userId: "user-management-2",
    role: "member",
    user: { id: "user-management-2", name: "Member", email: "member@example.com" },
  },
];

const invitation = {
  id: "invitation-1",
  email: "invitee@example.com",
  role: "member",
  status: "pending",
  expiresAt: "2026-12-01T00:00:00.000Z",
};

const apiKey: OrganizationApiKey = {
  id: "key-1",
  name: "Deploy key",
  prefix: "ak_",
  start: "ak_start",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderOverview({
  canDelete,
  isPersonal = false,
  isActive = true,
}: {
  canDelete: boolean;
  isPersonal?: boolean;
  isActive?: boolean;
}) {
  return render(
    <OrganizationOverview
      apiKeysCount={1}
      canDelete={canDelete}
      isDeleting={false}
      isActive={isActive}
      isPersonal={isPersonal}
      isLeaving={false}
      isSwitching={false}
      memberCount={2}
      pendingInvitationsCount={1}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      onLeave={vi.fn()}
      onSwitch={vi.fn()}
      org={organization}
    />,
  );
}

function renderInvitations({
  canManageMembers,
  isPersonal,
}: {
  canManageMembers: boolean;
  isPersonal: boolean;
}) {
  return render(
    <Tabs defaultValue="invitations">
      <InvitationsTab
        canManageMembers={canManageMembers}
        inviteEmail=""
        invitePending={false}
        inviteRole="member"
        invitations={[invitation]}
        isPersonal={isPersonal}
        isCancelling={false}
        isResending={false}
        onCancel={vi.fn()}
        onEmailChange={vi.fn()}
        onInvite={vi.fn()}
        onResend={vi.fn()}
        onRoleChange={vi.fn()}
      />
    </Tabs>,
  );
}

function OrganizationApiKeyHarness({ auth }: { auth: AuthClient }) {
  const queryKey = orgApiKeysQueryKey(ORG_ID);
  const { data: apiKeys = [] } = useQuery<OrganizationApiKey[]>({
    queryKey,
    queryFn: async () => [],
    enabled: false,
  });
  const { deleteApiKeyMutation } = useOrganizationApiKeyActions(auth, ORG_ID, vi.fn());

  return (
    <Tabs defaultValue="apikeys">
      <ApiKeysTab
        apiKeys={apiKeys}
        canManageMembers
        createdApiKey={null}
        isCreating={false}
        isDeleting={deleteApiKeyMutation.isPending}
        onCopy={vi.fn()}
        onCreate={vi.fn()}
        onDelete={(keyId) => deleteApiKeyMutation.mutate(keyId)}
        onDismiss={vi.fn()}
      />
    </Tabs>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("organization management controls", () => {
  it("shows owner edit/delete controls and keeps member self-removal forbidden", () => {
    renderOverview({ canDelete: true });
    expect(screen.getByRole("button", { name: "edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "delete org" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "leave" })).toBeNull();

    cleanup();
    render(
      <Tabs defaultValue="members">
        <MembersTab
          canManageMembers
          isRemoving={false}
          members={members}
          onRemove={vi.fn()}
          sessionUserId={USER_ID}
        />
      </Tabs>,
    );
    expect(screen.getAllByRole("button", { name: "remove" })).toHaveLength(1);
    expect(screen.getByText("Member")).toBeTruthy();

    cleanup();
    render(
      <Tabs defaultValue="members">
        <MembersTab
          canManageMembers={false}
          isRemoving={false}
          members={members}
          onRemove={vi.fn()}
          sessionUserId={USER_ID}
        />
      </Tabs>,
    );
    expect(screen.queryByRole("button", { name: "remove" })).toBeNull();
  });

  it("gives non-owner members leave access without owner edit/delete controls", () => {
    renderOverview({ canDelete: false });
    expect(screen.getByRole("button", { name: "leave" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "delete org" })).toBeNull();
  });

  it("does not offer invitations from a personal organization", () => {
    renderInvitations({ canManageMembers: true, isPersonal: true });
    expect(screen.queryByPlaceholderText("email@example.com")).toBeNull();
    expect(screen.queryByRole("button", { name: "send invitation" })).toBeNull();
  });

  it("gates pending invitation actions to owners and admins", () => {
    const admin = renderInvitations({ canManageMembers: true, isPersonal: false });
    expect(screen.getByPlaceholderText("email@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "send invitation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "resend" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "cancel" })).toBeTruthy();
    admin.unmount();

    renderInvitations({ canManageMembers: false, isPersonal: false });
    expect(screen.queryByPlaceholderText("email@example.com")).toBeNull();
    expect(screen.queryByRole("button", { name: "send invitation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "resend" })).toBeNull();
    expect(screen.queryByRole("button", { name: "cancel" })).toBeNull();
  });

  it("rolls back an optimistic API-key deletion when the auth boundary rejects", async () => {
    const pendingDelete = deferred<{ error: { message: string } }>();
    const deleteApiKey = vi.fn(() => pendingDelete.promise);
    const auth = {
      apiKey: { delete: deleteApiKey },
    } as unknown as AuthClient;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(orgApiKeysQueryKey(ORG_ID), [apiKey]);

    render(
      <QueryClientProvider client={queryClient}>
        <OrganizationApiKeyHarness auth={auth} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Deploy key")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "delete" }));
    await waitFor(() => expect(screen.queryByText("Deploy key")).toBeNull());
    expect(queryClient.getQueryData(orgApiKeysQueryKey(ORG_ID))).toEqual([]);
    expect(deleteApiKey).toHaveBeenCalledWith({ keyId: "key-1", configId: "org-keys" });

    pendingDelete.resolve({ error: { message: "delete denied" } });
    expect(await screen.findByText("Deploy key")).toBeTruthy();
    expect(queryClient.getQueryData(orgApiKeysQueryKey(ORG_ID))).toEqual([apiKey]);
    expect(mocks.error).toHaveBeenCalledWith("delete denied");
  });
});
