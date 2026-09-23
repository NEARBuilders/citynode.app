import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button, Card, CardContent, PageContainer } from "@/components";

export function ApplySubmitted({ proposalId }: { proposalId: string }) {
  return (
    <PageContainer variant="wide">
      <Card>
        <CardContent className="space-y-4 p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-primary" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">Application submitted</h1>
            <p className="text-sm text-muted-foreground">
              Your proposal is awaiting platform administrator review.
            </p>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{proposalId}</p>
          <Button asChild variant="outline">
            <Link to="/dashboard">back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
