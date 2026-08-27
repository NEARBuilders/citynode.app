import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { sessionQueryKey, useAuthClient } from "@/app";

export function useSwitchOrganization() {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await auth.organization.setActive({ organizationId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      const { data: session, error } = await auth.getSession({
        query: { disableCookieCache: true },
      });
      if (error) throw new Error(error.message);
      queryClient.setQueryData(sessionQueryKey, session ?? null);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await router.invalidate();
      toast.success("Switched organization");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to switch organization");
    },
  });
}
