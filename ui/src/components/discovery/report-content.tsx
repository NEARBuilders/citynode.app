import { useApiClient } from "@/app";
import { Textarea } from "@/components";
import { DiscoveryAction } from "./discovery-action";
export function ReportContent({
  targetId,
  kind,
}: {
  targetId: string;
  kind: "profile" | "activity";
}) {
  const api = useApiClient();
  return (
    <details className="text-xs text-muted-foreground">
      <summary
        data-testid={`discovery-report-${targetId}`}
        className="cursor-pointer hover:text-foreground"
      >
        Something wrong? Let us know
      </summary>
      <div className="mt-3">
        <DiscoveryAction
          testId={`discovery-report-submit-${targetId}`}
          label="Send report"
          run={(data) => {
            let token = sessionStorage.getItem("discovery-report-token");
            if (!token) {
              token = crypto.randomUUID();
              sessionStorage.setItem("discovery-report-token", token);
            }
            return api.reportDiscoveryContent({
              targetId,
              kind,
              token,
              reason: String(data.get("reason")),
            });
          }}
        >
          <label htmlFor={`report-${targetId}`}>
            What happened?
            <Textarea
              id={`report-${targetId}`}
              data-testid={`discovery-report-reason-${targetId}`}
              name="reason"
              required
              minLength={5}
              maxLength={1000}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Only the people who look after CityNode can see your report.
          </p>
        </DiscoveryAction>
      </div>
    </details>
  );
}
