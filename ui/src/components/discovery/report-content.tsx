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
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer">
        Report this {kind === "profile" ? "node" : "activity"}
      </summary>
      <DiscoveryAction
        label="Submit report"
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
          Reason
          <Textarea
            id={`report-${targetId}`}
            name="reason"
            required
            minLength={5}
            maxLength={1000}
          />
        </label>
        <p>Reports are visible only to platform administrators.</p>
      </DiscoveryAction>
    </details>
  );
}
