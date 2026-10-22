import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionQueryKey, sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { LoginLocale } from "./catalogs";
import { isLoginLocale, LoginI18nProvider, translateLoginMessage } from "./runtime";

export function LoginAccountLocaleProvider({ children }: { children: ReactNode }) {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const saveLocale = useMutation({
    scope: { id: "account-locale" },
    mutationFn: async (locale: LoginLocale) => {
      if (!session?.user) return;
      const { error } = await auth.updateUser({ locale });
      if (error) throw new Error("Locale preference could not be saved");
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
    onError: () => toast.error(translateLoginMessage("auth.error.saveLocale")),
    onSuccess: (_, locale) =>
      toast.success(translateLoginMessage("auth.locale.updated", undefined, locale)),
  });
  const preferred = session?.user.locale;
  return (
    <LoginI18nProvider
      initialLocale={preferred && isLoginLocale(preferred) ? preferred : undefined}
      onLocaleChange={saveLocale.mutateAsync}
    >
      {children}
    </LoginI18nProvider>
  );
}
