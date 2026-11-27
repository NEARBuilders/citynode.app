import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/i18n/runtime";

export type HandleStatus = "idle" | "checking" | "available" | "taken";

const HANDLE_PATTERN = /^[a-z0-9-]+$/;

export function useHandleStatus(slug: string, currentSlug?: string): HandleStatus {
  const apiClient = useApiClient();
  const checkable = HANDLE_PATTERN.test(slug) && slug !== currentSlug;
  const { data, isFetching } = useQuery({
    queryKey: ["org-slug-check", slug],
    queryFn: () => apiClient.auth.checkSlug({ slug }),
    enabled: checkable,
    staleTime: 5_000,
  });
  if (!slug) return "idle";
  if (slug === currentSlug) return "available";
  if (!checkable) return "idle";
  if (isFetching) return "checking";
  if (!data) return "idle";
  return data.status ? "available" : "taken";
}

export function HandleStatusAddon({ status, testId }: { status: HandleStatus; testId?: string }) {
  const translate = useAppTranslation();
  return (
    <InputGroupAddon align="inline-end" data-testid={testId}>
      {status === "checking" ? (
        <Spinner />
      ) : status === "available" ? (
        <CheckCircleIcon className="text-success" aria-label={translate("org.handleAvailable")} />
      ) : status === "taken" ? (
        <XCircleIcon className="text-destructive" aria-label={translate("org.handleTaken")} />
      ) : null}
    </InputGroupAddon>
  );
}
