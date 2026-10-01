import { Badge } from "@/components/ui/badge";

const STATUS_VARIANTS: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
> = {
  SUCCESS: { variant: "default", label: "Success" },
  PROCESSING: { variant: "secondary", label: "Processing" },
  PENDING_SIGNATURE: { variant: "secondary", label: "Awaiting signature" },
  FAILED: { variant: "destructive", label: "Failed" },
  REFUNDED: { variant: "outline", label: "Refunded" },
  UNCERTAIN: { variant: "outline", label: "Uncertain" },
};

export function StatusBadge({ status }: { status: string }) {
  const conf = STATUS_VARIANTS[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={conf.variant}>{conf.label}</Badge>;
}
