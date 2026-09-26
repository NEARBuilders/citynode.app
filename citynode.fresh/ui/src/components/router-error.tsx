export function RouterError({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-4">Oops!</h1>
        <p className="text-muted-foreground mb-4">Something went wrong</p>
        <details className="text-sm text-muted-foreground bg-muted p-4 rounded mb-8">
          <summary className="cursor-pointer">Error Details</summary>
          <pre className="mt-2 whitespace-pre-wrap text-left">{error.message}</pre>
        </details>
      </div>
    </div>
  );
}
