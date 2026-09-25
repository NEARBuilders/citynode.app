import { EnvelopeIcon } from "@phosphor-icons/react";
import { Card, Chip } from "@/components";

export function EmailMethod({ user }: { user: { email?: string } }) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <EnvelopeIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-foreground">Email</span>
            <Chip muted={!user.email}>{user.email ? "linked" : "not linked"}</Chip>
          </div>
          <p className="text-sm text-muted-foreground">
            {user.email ?? "Email login has not been linked for this account yet."}
          </p>
        </div>
      </div>
    </Card>
  );
}
