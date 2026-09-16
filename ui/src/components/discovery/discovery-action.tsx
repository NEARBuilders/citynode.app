import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button } from "@/components";
export function DiscoveryAction({
  children,
  label,
  run,
  testId,
}: {
  children?: ReactNode;
  label: string;
  testId?: string;
  run: (data: FormData) => Promise<unknown>;
}) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: run,
    onSuccess: () =>
      client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("discovery") }),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
    >
      {children}
      <Button data-testid={testId} disabled={mutation.isPending}>
        {label}
      </Button>
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
      {mutation.isSuccess && <p role="status">Saved.</p>}
    </form>
  );
}
