import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function RouterError({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <div
      className="flex min-h-96 flex-1 items-center justify-center bg-background px-4 py-16"
      role="alert"
      data-testid="router-error"
    >
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive-muted text-destructive-muted-foreground">
          <WarningCircleIcon className="size-7" />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold text-foreground">This page didn’t load</h1>
          <p className="text-base text-muted-foreground">
            Something went wrong on our side. Try again, or head back home.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            nativeButton={false}
            render={<a href="/">Back home</a>}
            data-testid="router-error-home"
          />
          <Button
            variant="outline"
            onClick={() => (reset ? reset() : window.location.reload())}
            data-testid="router-error-retry"
          >
            Try again
          </Button>
        </div>
        <details className="w-full text-left text-sm text-muted-foreground">
          <summary className="cursor-pointer text-center">Error details</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-xs">
            {error.message}
          </pre>
        </details>
      </div>
    </div>
  );
}
