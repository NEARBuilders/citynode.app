import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { sessionQueryKey, useAuthClient } from "@/app";
import { teamWorkspaceQueryKey } from "@/lib/team-workspace";

export function useSwitchTeam() {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (teamId: string | null) => {
      const { error } = await auth.organization.setActiveTeam({ teamId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_, teamId) => {
      const { data: session, error } = await auth.getSession({
        query: { disableCookieCache: true },
      });
      if (error) throw new Error(error.message);
      queryClient.setQueryData(sessionQueryKey, session ?? null);
      await queryClient.invalidateQueries({ queryKey: teamWorkspaceQueryKey });
      await router.invalidate();
      toast.success(teamId ? "Switched team workspace" : "Showing all areas");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to switch team");
    },
  });
}
