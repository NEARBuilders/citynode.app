import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ApplySubmit({
  canSubmit,
  isSubmitting,
}: {
  canSubmit: boolean;
  isSubmitting: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={!canSubmit} data-testid="apply.submit">
        {isSubmitting && <Spinner />}
        {isSubmitting ? "Submitting…" : "Submit for review"}
      </Button>
      <p className="text-sm text-muted-foreground">An admin reviews every new community.</p>
    </div>
  );
}
