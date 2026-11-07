import { CalendarDotsIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { ActivityFormPage, activitiesQueryOptions } from "@/components/discovery/activity-form";
import { EmptyState } from "@/components/empty-state";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { AppMessageId } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import {
  draftFromReport,
  type EventReport,
  emptyReportDraft,
  REPORT_AUDIENCES,
  REPORT_QUESTIONS,
  type ReportDraft,
  type ReportFieldError,
  type ReportQuestion,
  reportFromDraft,
} from "@/lib/event-reports";
import { pageTitle } from "@/lib/page-title";
import { engagementQueryKeys } from "@/lib/queries/engagement";
import {
  eventCheckInCountQueryOptions,
  eventReportQueryKeys,
  eventReportQueryOptions,
} from "@/lib/queries/event-reports";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import { tenantByIdQueryOptions } from "@/lib/queries/tenants";

export const Route = createFileRoute(
  "/_authenticated/_dashboard/nodes/$nodeId/events/$activityId/report",
)({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "report.title",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: EventReportPage,
});

const ERROR_MESSAGES: Record<ReportFieldError, AppMessageId> = {
  required: "report.error.required",
  invalidLink: "report.error.invalidLink",
  invalidNumber: "report.error.invalidNumber",
  tooManyLinks: "report.error.tooManyLinks",
};

function EventReportPage() {
  const translate = useAppTranslation();
  const { nodeId, activityId } = Route.useParams();
  const { auth } = Route.useRouteContext();
  const api = useApiClient();
  const activities = useQuery(activitiesQueryOptions(api, nodeId));
  const activity = activities.data?.find((item) => item.id === activityId);
  const report = useQuery(eventReportQueryOptions(api, activityId));
  const tenantId = useQuery(nodeByIdQueryOptions(api, nodeId)).data?.tenantId;
  const organizationId = useQuery(tenantByIdQueryOptions(api, tenantId ?? "")).data?.orgId ?? null;
  const checkIns = useQuery(
    eventCheckInCountQueryOptions(
      api,
      organizationId && organizationId === auth.activeOrganizationId ? organizationId : null,
      activityId,
    ),
  );

  const loading =
    activities.isPending ||
    report.isPending ||
    (checkIns.isPending && checkIns.fetchStatus !== "idle");
  if (loading) {
    return (
      <ActivityFormPage
        nodeId={nodeId}
        title={<Skeleton className="h-10 w-full max-w-64" />}
        headerTestId="report.heading"
      >
        <div className="flex flex-col gap-6" aria-busy="true">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} className="h-11 w-full" />
          ))}
        </div>
      </ActivityFormPage>
    );
  }

  const loadError = activities.error ?? report.error;
  if (loadError || !activity) {
    return (
      <ActivityFormPage
        nodeId={nodeId}
        title={translate("report.title")}
        headerTestId="report.heading"
      >
        <EmptyState
          icon={CalendarDotsIcon}
          title={translate(loadError ? "report.loadError" : "events.notFound")}
          description={loadError ? appErrorMessage(loadError, translate) : undefined}
          action={
            loadError && (
              <Button
                variant="outline"
                data-testid="report-retry"
                onClick={() => {
                  if (activities.isError) void activities.refetch();
                  if (report.isError) void report.refetch();
                }}
              >
                {translate("common.retry")}
              </Button>
            )
          }
        />
      </ActivityFormPage>
    );
  }

  const { report: saved, canEdit } = report.data ?? { report: null, canEdit: false };
  return (
    <ActivityFormPage
      nodeId={nodeId}
      title={translate("report.title")}
      description={
        <span>
          {activity.title}
          {activity.startsAt && (
            <>
              {" · "}
              <LocalDate value={activity.startsAt} />
            </>
          )}
          {saved && (
            <>
              {" · "}
              {saved.source === "import" && (
                <>
                  {translate("report.status.imported")}
                  {" · "}
                </>
              )}
              <Trans
                id="report.lastUpdated"
                components={{ date: <LocalDate value={saved.updatedAt} format="relative" /> }}
              />
            </>
          )}
        </span>
      }
      headerTestId="report.heading"
    >
      {canEdit ? (
        <ReportForm
          key={saved?.updatedAt ?? "new"}
          nodeId={nodeId}
          activityId={activityId}
          initial={saved ? draftFromReport(saved.report) : emptyReportDraft(checkIns.data ?? null)}
          isEdit={!!saved}
        />
      ) : saved ? (
        <ReportAnswers report={saved.report} />
      ) : (
        <EmptyState icon={CalendarDotsIcon} title={translate("report.notSubmitted")} />
      )}
    </ActivityFormPage>
  );
}

function ReportAnswers({ report }: { report: EventReport }) {
  const translate = useAppTranslation();
  const none = <span className="text-muted-foreground">—</span>;
  const text = (value: string) => (value.trim() ? value : none);
  const answer = (question: ReportQuestion): ReactNode => {
    switch (question.kind) {
      case "choice":
        return translate(`report.option.${question.id}.${report[question.id]}` as AppMessageId);
      case "audiences":
        return [
          ...report.audiences
            .filter((audience) => audience !== "other")
            .map((audience) => translate(`report.option.audiences.${audience}` as AppMessageId)),
          ...(report.audiences.includes("other") ? [report.audienceOther] : []),
        ].join(", ");
      case "number":
        return report.attendees;
      case "kpis":
        return (
          <ul className="flex flex-col gap-1">
            {report.kpis.filter(Boolean).map((kpi) => (
              <li key={kpi}>{kpi}</li>
            ))}
          </ul>
        );
      case "partners":
        return report.hadPartners
          ? `${translate("report.option.partners.yes")} — ${report.partners}`
          : translate("report.option.partners.no");
      case "links":
        return report[question.id].length > 0 ? (
          <ul className="flex flex-col gap-1">
            {report[question.id].map((link) => (
              <li key={link} className="wrap-anywhere">
                <a href={link} target="_blank" rel="noreferrer" className="underline">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          none
        );
      case "longText":
        return text(report[question.id]);
    }
  };
  return (
    <dl className="flex flex-col gap-6" data-testid="report-answers">
      {REPORT_QUESTIONS.map((question) => (
        <div key={question.id} className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-muted-foreground">
            {translate(`report.q.${question.id}` as AppMessageId)}
          </dt>
          <dd className="whitespace-pre-wrap text-foreground">{answer(question)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReportForm({
  nodeId,
  activityId,
  initial,
  isEdit,
}: {
  nodeId: string;
  activityId: string;
  initial: ReportDraft;
  isEdit: boolean;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, ReportFieldError>>({});
  const update = (patch: Partial<ReportDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const save = useMutation({
    mutationFn: (report: NonNullable<ReturnType<typeof reportFromDraft>["report"]>) =>
      api.saveEventReport({ activityId, report }),
    onSuccess: async () => {
      toast.success(translate("report.saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventReportQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: engagementQueryKeys.events() }),
      ]);
      await navigate({
        to: "/nodes/$nodeId/content",
        params: { nodeId },
        search: { tab: "events" },
      });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  const errorFor = (id: string) =>
    errors[id] ? <FieldError>{translate(ERROR_MESSAGES[errors[id]])}</FieldError> : null;

  const renderQuestion = (question: ReportQuestion): ReactNode => {
    const label = translate(`report.q.${question.id}` as AppMessageId);
    const required = question.required ? " *" : "";
    switch (question.kind) {
      case "choice":
        return (
          <FieldSet key={question.id} data-testid={`report-${question.id}`}>
            <FieldLegend variant="label">{label + required}</FieldLegend>
            <RadioGroup
              value={draft[question.id]}
              onValueChange={(value) => update({ [question.id]: value } as Partial<ReportDraft>)}
            >
              {question.options.map((option) => (
                <Field key={option} orientation="horizontal">
                  <RadioGroupItem id={`report-${question.id}-${option}`} value={option} />
                  <FieldLabel htmlFor={`report-${question.id}-${option}`}>
                    {translate(`report.option.${question.id}.${option}` as AppMessageId)}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
            {errorFor(question.id)}
          </FieldSet>
        );
      case "audiences":
        return (
          <FieldSet key={question.id} data-testid="report-audiences">
            <FieldLegend variant="label">{label + required}</FieldLegend>
            {REPORT_AUDIENCES.map((audience) => (
              <Field key={audience} orientation="horizontal">
                <Checkbox
                  id={`report-audience-${audience}`}
                  checked={draft.audiences.includes(audience)}
                  onCheckedChange={(checked) =>
                    update({
                      audiences: checked
                        ? [...draft.audiences, audience]
                        : draft.audiences.filter((value) => value !== audience),
                    })
                  }
                />
                <FieldLabel htmlFor={`report-audience-${audience}`}>
                  {translate(`report.option.audiences.${audience}` as AppMessageId)}
                </FieldLabel>
              </Field>
            ))}
            {draft.audiences.includes("other") && (
              <Field>
                <Input
                  aria-label={translate("report.audienceOther")}
                  placeholder={translate("report.audienceOther")}
                  value={draft.audienceOther}
                  onChange={(event) => update({ audienceOther: event.target.value })}
                  maxLength={200}
                />
                {errorFor("audienceOther")}
              </Field>
            )}
            {errorFor("audiences")}
          </FieldSet>
        );
      case "number":
        return (
          <Field key={question.id}>
            <FieldLabel htmlFor="report-attendees">{label + required}</FieldLabel>
            <Input
              id="report-attendees"
              data-testid="report-attendees"
              inputMode="numeric"
              value={draft.attendees}
              onChange={(event) => update({ attendees: event.target.value })}
            />
            <FieldDescription>{translate("report.attendeesHint")}</FieldDescription>
            {errorFor("attendees")}
          </Field>
        );
      case "kpis":
        return (
          <FieldSet key={question.id} data-testid="report-kpis">
            <FieldLegend variant="label">{label}</FieldLegend>
            {([0, 1, 2] as const).map((index) => (
              <Field key={index}>
                <FieldLabel htmlFor={`report-kpi-${index + 1}`}>
                  {translate("report.kpi", { number: index + 1 }) + (index < 2 ? " *" : "")}
                </FieldLabel>
                <Input
                  id={`report-kpi-${index + 1}`}
                  value={draft.kpis[index]}
                  maxLength={300}
                  onChange={(event) => {
                    const kpis: ReportDraft["kpis"] = [...draft.kpis];
                    kpis[index] = event.target.value;
                    update({ kpis });
                  }}
                />
                {errorFor(`kpi${index + 1}`)}
              </Field>
            ))}
          </FieldSet>
        );
      case "partners":
        return (
          <FieldSet key={question.id} data-testid="report-partners">
            <FieldLegend variant="label">{label + required}</FieldLegend>
            <RadioGroup
              value={draft.hadPartners === null ? "" : draft.hadPartners ? "yes" : "no"}
              onValueChange={(value) => update({ hadPartners: value === "yes" })}
            >
              {(["yes", "no"] as const).map((option) => (
                <Field key={option} orientation="horizontal">
                  <RadioGroupItem id={`report-partners-${option}`} value={option} />
                  <FieldLabel htmlFor={`report-partners-${option}`}>
                    {translate(`report.option.partners.${option}` as AppMessageId)}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
            {errorFor("hadPartners")}
            {draft.hadPartners && (
              <Field>
                <FieldLabel htmlFor="report-partners-who">
                  {translate("report.partnersWho")}
                </FieldLabel>
                <Textarea
                  id="report-partners-who"
                  value={draft.partners}
                  maxLength={4000}
                  onChange={(event) => update({ partners: event.target.value })}
                />
                {errorFor("partners")}
              </Field>
            )}
          </FieldSet>
        );
      case "links":
        return (
          <Field key={question.id}>
            <FieldLabel htmlFor={`report-${question.id}`}>{label + required}</FieldLabel>
            <Textarea
              id={`report-${question.id}`}
              data-testid={`report-${question.id}`}
              value={draft[question.id]}
              rows={3}
              onChange={(event) =>
                update({ [question.id]: event.target.value } as Partial<ReportDraft>)
              }
            />
            <FieldDescription>{translate("report.linksHint")}</FieldDescription>
            {errorFor(question.id)}
          </Field>
        );
      case "longText":
        return (
          <Field key={question.id}>
            <FieldLabel htmlFor={`report-${question.id}`}>{label + required}</FieldLabel>
            <Textarea
              id={`report-${question.id}`}
              data-testid={`report-${question.id}`}
              value={draft[question.id]}
              maxLength={4000}
              onChange={(event) =>
                update({ [question.id]: event.target.value } as Partial<ReportDraft>)
              }
            />
            {errorFor(question.id)}
          </Field>
        );
    }
  };

  return (
    <form
      className="flex flex-col gap-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const result = reportFromDraft(draft);
        if (result.errors) {
          setErrors(result.errors);
          toast.error(translate("report.fixErrors"));
          return;
        }
        setErrors({});
        save.mutate(result.report);
      }}
    >
      <FieldGroup>{REPORT_QUESTIONS.map(renderQuestion)}</FieldGroup>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending} data-testid="report-submit">
          {translate(isEdit ? "report.saveChanges" : "report.submit")}
        </Button>
      </div>
    </form>
  );
}
