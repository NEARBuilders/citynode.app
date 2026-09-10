import { Skeleton } from "./ui/skeleton";

export function NodeDirectorySkeleton() {
  return (
    <div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-4 last:border-0">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="ml-auto h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
