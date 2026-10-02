import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import { clearAuthenticatedQueries, sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import { getNearInitials, resolveNearImageUrl } from "@/lib/near-profile";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { isSyntheticEmail } from "@/lib/synthetic-email";
import { useNearAccount } from "@/lib/use-near-account";

export function useIdentity() {
  const auth = useAuthClient();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const sessionQuery = useQuery(sessionQueryOptions(auth));
  const session = sessionQuery.data;
  const user = session?.user;
  const nearAccountId = useNearAccount();

  const organizationsQuery = useQuery({
    ...organizationsQueryOptions(apiClient),
    enabled: !!user,
  });
  const organizations = organizationsQuery.data;
  const activeOrgId = session?.session?.activeOrganizationId;

  const activeOrg = useMemo(() => {
    return organizations?.find((org) => org.id === activeOrgId);
  }, [organizations, activeOrgId]);

  const { data: nearProfile } = useQuery({
    queryKey: ["near-profile", nearAccountId],
    queryFn: async () => {
      const { data } = await auth.near.getProfile(nearAccountId ?? undefined);
      return data ?? null;
    },
    enabled: !!nearAccountId,
    staleTime: 5 * 60 * 1000,
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.signOut();
      if (error) {
        throw new Error(error.message || "Failed to sign out");
      }
      await auth.near.disconnect().catch(() => {});
    },
    onSuccess: async () => {
      await clearAuthenticatedQueries(queryClient);
      await router.invalidate();
      await navigate({ to: "/", replace: true });
    },
    onError: (error: Error) => {
      console.error("Sign out error:", error);
    },
  });

  const avatarSrc = resolveNearImageUrl(nearProfile?.image) ?? user?.image ?? undefined;
  const validEmail =
    user && !user.isAnonymous && user.email && !isSyntheticEmail(user.email) ? user.email : null;
  const displayName = nearProfile?.name || user?.name || nearAccountId || validEmail || "guest";
  const handle = nearAccountId || validEmail || "anonymous session";
  const showHandle = handle !== displayName;
  const initials = getNearInitials(nearProfile?.name || user?.name || nearAccountId);

  return {
    user,
    session,
    isSessionLoading: sessionQuery.isLoading,
    nearAccountId,
    organizations: organizations ?? [],
    isOrganizationsLoading: sessionQuery.isPending || (!!user && organizationsQuery.isPending),
    organizationsError: sessionQuery.error ?? organizationsQuery.error,
    retryOrganizations: () =>
      sessionQuery.isError ? sessionQuery.refetch() : organizationsQuery.refetch(),
    activeOrgId,
    activeOrg,
    nearProfile,
    signOutMutation,
    avatarSrc,
    validEmail,
    displayName,
    handle,
    showHandle,
    initials,
  };
}
