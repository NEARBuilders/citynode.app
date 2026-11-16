export function refetchAll(queries: readonly { refetch: () => unknown }[]) {
  for (const query of queries) void query.refetch();
}
