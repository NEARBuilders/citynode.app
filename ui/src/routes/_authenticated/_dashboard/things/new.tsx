import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { pluginHref, pluginPath, useApiClient } from "@/app";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PageContainer,
  PageHeader,
  Textarea,
} from "@/components";
import { FieldGroup } from "@/components/ui/field";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { invalidateThingAfterProposal } from "./-thing-cache";
import {
  DEFAULT_THING_PAYLOAD,
  formatThingPayload,
  isSignInError,
  parseThingPayload,
} from "./-thing-form";

export const Route = createFileRoute("/_authenticated/_dashboard/things/new")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.newThing",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.newThingDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  component: CreateThingPage,
});

function CreateThingPage() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [thingId, setThingId] = useState("");
  const [payloadRaw, setPayloadRaw] = useState(DEFAULT_THING_PAYLOAD);
  const payload = parseThingPayload(payloadRaw, translate);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!thingId.trim()) throw new Error("thingId is required");
      const parsed = parseThingPayload(payloadRaw, translate);
      if (!parsed.ok) throw new Error("Invalid JSON payload");
      return apiClient.proposals.propose({
        pluginId: "template",
        entityId: thingId.trim(),
        payload: parsed.value,
        source: "things/new",
      });
    },
    onSuccess: async ({ data: proposal }) => {
      toast.success(translate("things.submitted"), {
        description: translate("things.submittedDescription"),
      });
      try {
        await invalidateThingAfterProposal(queryClient, proposal.entityId);
      } catch {
        toast.warning(translate("things.submitRefreshFailed"));
      }
      void navigate({
        to: "/things/$thingId",
        params: { thingId: proposal.entityId },
      });
    },
    onError: (err: Error) => toast.error(appErrorMessage(err, translate)),
  });

  const submitError = submitMutation.isError ? submitMutation.error : null;
  const needsSignIn = submitError ? isSignInError(submitError) : false;

  return (
    <PageContainer variant="narrow">
      <PageHeader
        title={translate("things.new")}
        description={translate("things.reviewHint")}
        headerTestId="things.new.heading"
      />

      <form
        className="flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          submitMutation.mutate();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="thing-id">{translate("things.id")}</FieldLabel>
            <Input
              id="thing-id"
              type="text"
              className="font-mono"
              value={thingId}
              onChange={(e) => setThingId(e.target.value)}
              placeholder={translate("things.idExample")}
              autoComplete="off"
              data-testid="things-new-id"
            />
            <FieldDescription>{translate("things.uniqueHint")}</FieldDescription>
          </Field>

          <Field data-invalid={!payload.ok || undefined}>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="payload-json">{translate("things.payload")}</FieldLabel>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!payload.ok}
                onClick={() => setPayloadRaw(formatThingPayload(payloadRaw))}
              >
                {translate("things.format")}
              </Button>
            </div>
            <Textarea
              id="payload-json"
              className="font-mono"
              value={payloadRaw}
              onChange={(e) => setPayloadRaw(e.target.value)}
              rows={10}
              spellCheck={false}
              aria-invalid={!payload.ok || undefined}
              data-testid="things-new-payload"
            />
            {payload.ok ? (
              <FieldDescription>{translate("things.jsonHint")}</FieldDescription>
            ) : (
              <FieldError>{payload.error}</FieldError>
            )}
          </Field>
        </FieldGroup>

        {submitError && (
          <div className="flex flex-col gap-1" role="alert" data-testid="things-new-error">
            <p className="text-sm text-destructive">
              {needsSignIn
                ? translate("things.sessionExpired")
                : submitError.message || translate("things.submitFailed")}
            </p>
            {needsSignIn && (
              <Link
                to={pluginPath("/login")}
                href={pluginHref("/login", { redirect: "/things/new" })}
                className="text-sm font-medium text-foreground underline underline-offset-4"
              >
                {translate("things.signInAgain")}
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="submit"
            disabled={submitMutation.isPending || !thingId.trim() || !payload.ok}
            data-testid="things-new-submit"
          >
            {submitMutation.isPending ? translate("things.submitting") : translate("things.submit")}
          </Button>
          <Button variant="ghost" nativeButton={false} render={<Link to="/things" />}>
            {translate("common.cancel")}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
