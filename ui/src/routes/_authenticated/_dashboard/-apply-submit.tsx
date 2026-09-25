import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { Badge, Button } from "@/components";

export function ApplySubmit({
  canSubmit,
  hostname,
  isSubmitting,
  hostnameAvailable,
}: {
  canSubmit: boolean;
  hostname: string;
  isSubmitting: boolean;
  hostnameAvailable: boolean | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={!canSubmit}>
        <PaperPlaneTiltIcon />
        {isSubmitting ? "submitting…" : "submit for review"}
      </Button>
      {hostname && hostnameAvailable !== undefined && (
        <Badge variant={hostnameAvailable ? "secondary" : "destructive"}>
          {hostnameAvailable ? "hostname available" : "hostname unavailable"}
        </Badge>
      )}
    </div>
  );
}
