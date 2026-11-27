import { Trans } from "everything-dev/ui/i18n";
import { LocalDate } from "@/components/local-date";
import { useAppTranslation } from "@/i18n/runtime";

export function MemberCountValue({
  count,
  observedAt,
  testId,
}: {
  count: number | null | undefined;
  observedAt: string | null | undefined;
  testId: string;
}) {
  const translate = useAppTranslation();
  if (count == null || !observedAt) {
    return <span data-testid={`${testId}-unavailable`}>{translate("members.notAvailable")}</span>;
  }
  return (
    <span className="flex flex-col gap-1">
      <span data-testid={`${testId}-value`}>{count}</span>
      <span
        className="text-xs font-normal text-muted-foreground"
        data-testid={`${testId}-observed`}
        title={translate("members.countAsOfHint")}
      >
        <Trans id="members.countAsOf" components={{ date: <LocalDate value={observedAt} /> }} />
      </span>
    </span>
  );
}
