import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { orgTeamMembersQueryKey, orgTeamsQueryKey } from "./-organization-query-keys";
import type { TeamsTabTeam } from "./-teams-tab";

export function useOrganizationTeams(orgId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const teamsQuery = useQuery({
    queryKey: orgTeamsQueryKey(orgId),
    queryFn: () => apiClient.auth.listTeams({ organizationId: orgId }),
    enabled: !!orgId,
  });
  const teamList = teamsQuery.data ?? [];
  const memberQueries = useQueries({
    queries: teamList.map((team) => ({
      queryKey: orgTeamMembersQueryKey(team.id),
      queryFn: () => apiClient.auth.listTeamMembers({ teamId: team.id }),
    })),
  });
  const teams: TeamsTabTeam[] = teamList.map((team, index) => ({
    id: team.id,
    name: team.name,
    areas: team.areas,
    memberUserIds: (memberQueries[index]?.data ?? []).map((member) => member.userId),
  }));

  const invalidateTeams = () =>
    queryClient.invalidateQueries({ queryKey: orgTeamsQueryKey(orgId) });
  const invalidateMembers = (teamId: string) =>
    queryClient.invalidateQueries({ queryKey: orgTeamMembersQueryKey(teamId) });
  const onError = (fallback: string) => (error: Error) => toast.error(error.message || fallback);

  const createTeam = useMutation({
    mutationFn: (name: string) => apiClient.auth.createTeam({ name, organizationId: orgId }),
    onSuccess: async (team) => {
      toast.success(`Team "${team.name}" created`);
      await invalidateTeams();
    },
    onError: onError("Failed to create team"),
  });
  const updateTeam = useMutation({
    mutationFn: (input: { teamId: string; name?: string; areas?: string[] }) =>
      apiClient.auth.updateTeam({
        teamId: input.teamId,
        organizationId: orgId,
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.areas !== undefined ? { areas: input.areas } : {}),
        },
      }),
    onSuccess: invalidateTeams,
    onError: onError("Failed to update team"),
  });
  const deleteTeam = useMutation({
    mutationFn: (teamId: string) => apiClient.auth.deleteTeam({ teamId, organizationId: orgId }),
    onSuccess: async () => {
      toast.success("Team deleted");
      await invalidateTeams();
    },
    onError: onError("Failed to delete team"),
  });
  const addTeamMember = useMutation({
    mutationFn: (input: { teamId: string; userId: string }) =>
      apiClient.auth.addTeamMember({ ...input, organizationId: orgId }),
    onSuccess: (_, input) => invalidateMembers(input.teamId),
    onError: onError("Failed to add team member"),
  });
  const removeTeamMember = useMutation({
    mutationFn: (input: { teamId: string; userId: string }) =>
      apiClient.auth.removeTeamMember({ ...input, organizationId: orgId }),
    onSuccess: (_, input) => invalidateMembers(input.teamId),
    onError: onError("Failed to remove team member"),
  });

  return {
    teams,
    isMutating:
      createTeam.isPending ||
      updateTeam.isPending ||
      deleteTeam.isPending ||
      addTeamMember.isPending ||
      removeTeamMember.isPending,
    createTeam,
    updateTeam,
    deleteTeam,
    addTeamMember,
    removeTeamMember,
  };
}
