import { ListBulletsIcon } from "@phosphor-icons/react";
import { Badge, Button, LocalDate } from "@/components";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAppTranslation } from "@/i18n/runtime";
import type { LogEntry } from "./-poc-lifecycle";
import { formatPocLogValue } from "./-poc-log-message";

export function PocLogSheet({ entries }: { entries: LogEntry[] }) {
  const translate = useAppTranslation();
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" data-testid="poc-log-open" />}>
        <ListBulletsIcon />
        {translate("lifecycle.chainLog")}
        {entries.length > 0 && <Badge variant="secondary">{entries.length}</Badge>}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle data-testid="poc-log">{translate("lifecycle.chainLog")}</SheetTitle>
          <SheetDescription>{translate("lifecycle.chainLogDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {entries.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {translate("lifecycle.noSignedActions")}
            </p>
          ) : (
            <ol className="flex flex-col gap-4" data-testid="poc-log-entries">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    <LocalDate value={entry.at} format="time" />
                  </span>
                  <span className="text-sm text-foreground">
                    {formatPocLogValue(entry.label, translate)}
                  </span>
                  {entry.detail && (
                    <span className="font-mono text-xs break-all text-muted-foreground">
                      {formatPocLogValue(entry.detail, translate)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
