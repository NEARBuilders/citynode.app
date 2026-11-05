import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldLabel,
  LocalDate,
  SectionHeader,
  Textarea,
} from "@/components";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { organizationRequestsQueryOptions } from "@/lib/queries/organizations";

type Request = Awaited<ReturnType<ApiClient["auth"]["listOrganizationRequests"]>>[number];

export function OrganizationRequests() {
  const translate = useAppTranslation();
  const api = useApiClient();
  const requests = useQuery(organizationRequestsQueryOptions(api));
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("orgApproval.title")}
        description={translate("orgApproval.description")}
        sectionTestId="admin-organizations.heading"
      />
      {requests.isPending ? (
        <p className="text-sm text-muted-foreground">{translate("orgApproval.loading")}</p>
      ) : requests.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {appErrorMessage(requests.error, translate)}
        </p>
      ) : requests.data.length === 0 ? (
        <p data-testid="admin-organizations-empty">{translate("orgApproval.empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.data.map((request) => (
            <OrganizationRequest key={request.id} request={request} />
          ))}
        </div>
      )}
    </section>
  );
}

function OrganizationRequest({ request }: { request: Request }) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const review = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      api.auth.reviewOrganization(
        decision === "approve"
          ? { organizationId: request.id, decision }
          : { organizationId: request.id, decision, reason },
      ),
    onSuccess: async (_, decision) => {
      toast.success(
        decision === "approve"
          ? translate("orgApproval.approved")
          : translate("orgApproval.rejectedToast"),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationRequestsQueryOptions(api).queryKey }),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      ]);
      await router.invalidate();
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  return (
    <Card data-testid={`admin-org-request-${request.slug}`}>
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-lg font-medium">{request.name}</h2>
          <p className="text-sm text-muted-foreground">
            <Trans
              id="orgApproval.requested"
              values={{ slug: request.slug }}
              components={{ date: <LocalDate value={request.createdAt} format="relative" /> }}
            />
          </p>
        </div>
        {rejecting && (
          <Field>
            <FieldLabel htmlFor={`reason-${request.id}`}>
              {translate("orgApproval.reason")}
            </FieldLabel>
            <Textarea
              id={`reason-${request.id}`}
              data-testid="admin-org-rejection-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              placeholder={translate("orgApproval.reasonHint")}
              autoFocus
            />
          </Field>
        )}
        <div className="flex gap-2">
          {rejecting ? (
            <>
              <Button
                variant="destructive"
                data-testid="admin-org-reject-confirm"
                disabled={review.isPending || !reason.trim()}
                onClick={() => review.mutate("reject")}
              >
                {translate("common.reject")}
              </Button>
              <Button
                variant="ghost"
                disabled={review.isPending}
                onClick={() => {
                  setRejecting(false);
                  setReason("");
                }}
              >
                {translate("common.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button
                data-testid="admin-org-approve"
                disabled={review.isPending}
                onClick={() => review.mutate("approve")}
              >
                {translate("common.approve")}
              </Button>
              <Button
                variant="ghost"
                data-testid="admin-org-reject"
                disabled={review.isPending}
                onClick={() => setRejecting(true)}
              >
                {translate("common.reject")}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
