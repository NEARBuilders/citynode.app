import { DocumentFallback } from "./document-fallback";

export function RootNotFound() {
  return (
    <DocumentFallback title="Page not found" body="The page you requested doesn't exist here." />
  );
}
