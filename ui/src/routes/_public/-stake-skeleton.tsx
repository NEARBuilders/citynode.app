import { Skeleton } from "@/components/ui/skeleton";

export function StakeSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="stake.loading">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );
}
