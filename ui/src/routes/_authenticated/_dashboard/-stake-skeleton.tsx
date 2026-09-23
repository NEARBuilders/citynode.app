import { Skeleton } from "@/components/ui/skeleton";

export function StakeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-16 w-full rounded-[10px]" />
      <Skeleton className="h-16 w-full rounded-[10px]" />
      <Skeleton className="h-40 w-full rounded-[10px]" />
    </div>
  );
}
