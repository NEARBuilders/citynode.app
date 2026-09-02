export function optimisticUpvoteCount(currentCount: number | undefined, nextHasUpvote: boolean) {
  const count = currentCount ?? 0;
  return Math.max(0, count + (nextHasUpvote ? 1 : -1));
}
