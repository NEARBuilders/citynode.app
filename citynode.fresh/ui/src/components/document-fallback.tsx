import { Link } from "@tanstack/react-router";

export function DocumentFallback({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        <div>
          <Link
            to="/"
            className="inline-flex items-center justify-center h-10 px-4 border border-border bg-card hover:bg-accent transition-colors"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
