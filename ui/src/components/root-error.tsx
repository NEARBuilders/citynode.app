import { DocumentFallback } from "./document-fallback";

export function RootError() {
  return (
    <DocumentFallback
      title="Application error"
      body="Something went wrong before the app layout could render."
    />
  );
}
