import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionQueryKey, sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { AppLocale } from "./catalogs";
import { AppI18nProvider, translateAppMessage } from "./runtime";

export function AccountLocaleProvider({
  children,
  initialLocale,
  preferredLocale,
}: {
  children: ReactNode;
  initialLocale?: string;
  preferredLocale?: string | null;
}) {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const saveLocale = useMutation({
    scope: { id: "account-locale" },
    mutationFn: async (locale: AppLocale) => {
      if (!session?.user) return;
      const { error } = await auth.updateUser({ locale });
      if (error) throw new Error("Locale preference could not be saved");
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
    onError: () => toast.error(translateAppMessage("locale.saveError")),
  });

  return (
    <AppI18nProvider
      initialLocale={initialLocale}
      preferredLocale={session?.user.locale ?? preferredLocale}
      onLocaleChange={saveLocale.mutateAsync}
    >
      {children}
    </AppI18nProvider>
  );
}
