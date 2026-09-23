import { Card } from "@/components";

export function OrganizationEmptyState({ label }: { label: string }) {
  return <Card className="p-8 text-center text-sm text-muted-foreground">{label}</Card>;
}
