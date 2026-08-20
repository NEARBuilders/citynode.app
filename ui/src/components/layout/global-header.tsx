import { UserNav } from "./user-nav";

export function GlobalHeader() {
  return (
    <header className="shrink-0">
      <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3">
        <UserNav showConnect />
      </div>
    </header>
  );
}
