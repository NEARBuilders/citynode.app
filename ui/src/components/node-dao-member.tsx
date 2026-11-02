import { HourglassIcon, UsersThreeIcon, WarningIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { MemberSigningStatus } from "@/components/member-signing-status";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAppTranslation } from "@/i18n/runtime";
import {
  type ContributorState,
  contributorRequestDescription,
  contributorState,
  POLL_DETAILS_MAX,
  POLL_TITLE_MAX,
  pollDescription,
  pollVoteAccess,
} from "@/lib/node-dao-contributors";
import {
  daoOpenProposalsQueryOptions,
  daoPolicyQueryOptions,
  nodeDaoQueryKeys,
  spendableYoctoQueryOptions,
} from "@/lib/queries/node-dao";
import {
  type SputnikProposal,
  type SputnikVoteAction,
  submitProposalWithBond,
  voteOnProposal,
} from "@/lib/sputnik-proposals";
import { yoctoToNearInput } from "@/lib/team-unstake";
import { useMemberSigning } from "@/lib/use-member-signing";
import { useNearAccount } from "@/lib/use-near-account";

type Translate = ReturnType<typeof useAppTranslation>;

export interface MemberDaoPanelProps {
  daoAccountId: string;
  community: { name: string; slug: string; parentId?: string };
}

/**
 * My community → Proposals, for the signed-in member: become a Contributor
 * (#477), then file polls (#413). Every state is read from the Node DAO's
 * policy and open proposals.
 */
export function MemberDaoPanel({ daoAccountId, community }: MemberDaoPanelProps) {
  const translate = useAppTranslation();
  const accountId = useNearAccount();
  const policyQuery = useQuery(daoPolicyQueryOptions(daoAccountId));
  const openQuery = useQuery({
    ...daoOpenProposalsQueryOptions(daoAccountId),
    enabled: !!accountId,
  });

  const header = (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium text-foreground">{translate("memberDao.title")}</h2>
      <p className="text-sm text-muted-foreground">
        {translate("memberDao.description", { dao: daoAccountId })}{" "}
        <Link
          to="/n/$slug/proposals"
          params={{ slug: community.slug }}
          search={{ parentId: community.parentId }}
          className="underline underline-offset-4"
          data-testid="member-dao.all-proposals"
        >
          {translate("memberDao.allProposals")}
        </Link>
      </p>
    </div>
  );

  let body: ReactNode;
  if (!accountId) {
    body = (
      <PanelNotice icon={WarningIcon} testId="member-dao.no-wallet">
        {translate("memberDao.noWallet")}
      </PanelNotice>
    );
  } else if (policyQuery.isPending || openQuery.isPending) {
    body = <Skeleton className="h-24 w-full rounded-2xl" />;
  } else if (policyQuery.isError || openQuery.isError || !policyQuery.data) {
    body = (
      <PanelNotice icon={WarningIcon} testId="member-dao.load-error" tone="error">
        {translate("memberDao.loadError", { dao: daoAccountId })}{" "}
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            void policyQuery.refetch();
            void openQuery.refetch();
          }}
        >
          {translate("common.retry")}
        </Button>
      </PanelNotice>
    );
  } else {
    body = (
      <ContributorBody
        state={contributorState(policyQuery.data, accountId, openQuery.data ?? [])}
        accountId={accountId}
        daoAccountId={daoAccountId}
        community={community}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3" data-testid="member-dao">
      {header}
      {body}
    </section>
  );
}

function ContributorBody({
  state,
  accountId,
  daoAccountId,
  community,
}: {
  state: ContributorState;
  accountId: string;
  daoAccountId: string;
  community: MemberDaoPanelProps["community"];
}) {
  const translate = useAppTranslation();
  switch (state.status) {
    case "not-set-up":
      return (
        <PanelNotice icon={UsersThreeIcon} testId="member-dao.not-set-up">
          {translate("memberDao.notSetUp")}
        </PanelNotice>
      );
    case "governance-only":
      return (
        <PanelNotice icon={UsersThreeIcon} testId="member-dao.governance-only">
          {translate("memberDao.governanceOnly")}
        </PanelNotice>
      );
    case "requested":
      return (
        <PanelNotice icon={HourglassIcon} testId="member-dao.requested">
          {translate("memberDao.requested")}{" "}
          <Link
            to="/n/$slug/proposals/$proposalId"
            params={{ slug: community.slug, proposalId: String(state.proposalId) }}
            search={{ parentId: community.parentId }}
            className="underline underline-offset-4"
          >
            {translate("daoProposals.number", { id: state.proposalId })}
          </Link>
        </PanelNotice>
      );
    case "can-request":
      return (
        <ContributorRequest
          accountId={accountId}
          daoAccountId={daoAccountId}
          role={state.role}
          bondYocto={state.request.bondYocto}
          community={community.name}
        />
      );
    case "contributor":
      if (!state.poll.canPropose) {
        return (
          <PanelNotice icon={UsersThreeIcon} testId="member-dao.polls-off">
            {translate(
              state.poll.reason === "bond-unavailable"
                ? "memberDao.bondUnavailable"
                : "memberDao.pollsOff",
            )}
          </PanelNotice>
        );
      }
      return (
        <PollForm
          accountId={accountId}
          daoAccountId={daoAccountId}
          bondYocto={state.poll.bondYocto ?? 0n}
        />
      );
  }
}

function ContributorRequest({
  accountId,
  daoAccountId,
  role,
  bondYocto,
  community,
}: {
  accountId: string;
  daoAccountId: string;
  role: string;
  bondYocto: bigint | null;
  community: string;
}) {
  const translate = useAppTranslation();
  const queryClient = useQueryClient();
  const signing = useMemberSigning<unknown>(accountId);
  const funds = useBondFunds(accountId, bondYocto);
  const submit = () =>
    signing
      .submit((wallet) =>
        submitProposalWithBond(
          wallet,
          daoAccountId,
          { kind: "add_member_to_role", memberId: accountId, role },
          contributorRequestDescription(accountId, community),
          bondYocto ?? 0n,
        ),
      )
      .then(() => queryClient.invalidateQueries({ queryKey: nodeDaoQueryKeys.open(daoAccountId) }))
      .catch(() => {});

  return (
    <Item variant="outline" data-testid="member-dao.can-request">
      <ItemMedia variant="icon">
        <UsersThreeIcon className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{translate("memberDao.becomeTitle")}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {translate("memberDao.becomeDescription")}
        </ItemDescription>
        <BondNotice accountId={accountId} bondYocto={bondYocto} funds={funds} />
        <MemberSigningStatus state={signing.state} onRetry={submit} />
      </ItemContent>
      <ItemActions className="w-full justify-end sm:w-auto">
        <Button
          size="sm"
          data-testid="member-dao.become"
          disabled={
            bondYocto === null ||
            !funds.enough ||
            signing.state.status === "connecting" ||
            signing.state.status === "signing" ||
            signing.state.status === "submitted"
          }
          onClick={submit}
        >
          {translate("memberDao.become")}
        </Button>
      </ItemActions>
    </Item>
  );
}

function PollForm({
  accountId,
  daoAccountId,
  bondYocto,
}: {
  accountId: string;
  daoAccountId: string;
  bondYocto: bigint;
}) {
  const translate = useAppTranslation();
  const queryClient = useQueryClient();
  const signing = useMemberSigning<unknown>(accountId);
  const funds = useBondFunds(accountId, bondYocto);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const busy = signing.state.status === "connecting" || signing.state.status === "signing";

  const submit = () =>
    signing
      .submit((wallet) =>
        submitProposalWithBond(
          wallet,
          daoAccountId,
          { kind: "vote" },
          pollDescription(title, details),
          bondYocto,
        ),
      )
      .then(async () => {
        setTitle("");
        setDetails("");
        await queryClient.invalidateQueries({ queryKey: ["node-dao"] });
      })
      .catch(() => {});

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy || !funds.enough) return;
    if (signing.state.status === "submitted") signing.reset();
    void submit();
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-border p-4"
      onSubmit={onSubmit}
      data-testid="member-dao.poll-form"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">{translate("memberDao.pollTitle")}</h3>
        <p className="text-sm text-muted-foreground">{translate("memberDao.pollDescription")}</p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="poll-title">{translate("memberDao.pollQuestion")}</FieldLabel>
          <Input
            id="poll-title"
            value={title}
            maxLength={POLL_TITLE_MAX}
            required
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="poll-details">{translate("memberDao.pollDetails")}</FieldLabel>
          <Textarea
            id="poll-details"
            value={details}
            maxLength={POLL_DETAILS_MAX}
            rows={4}
            disabled={busy}
            onChange={(event) => setDetails(event.target.value)}
          />
          <FieldDescription>{translate("memberDao.pollDetailsHint")}</FieldDescription>
        </Field>
      </FieldGroup>
      <BondNotice accountId={accountId} bondYocto={bondYocto} funds={funds} />
      <MemberSigningStatus state={signing.state} onRetry={() => void submit()} />
      <Button
        type="submit"
        size="sm"
        className="self-end"
        disabled={!title.trim() || busy || !funds.enough}
        data-testid="member-dao.poll-submit"
      >
        {translate("memberDao.pollSubmit")}
      </Button>
    </form>
  );
}

interface BondFunds {
  /** True when there's no bond, or the wallet holds enough to pay it. */
  enough: boolean;
  status: "none" | "loading" | "error" | "ready";
  spendableYocto: bigint | null;
}

function useBondFunds(accountId: string, bondYocto: bigint | null): BondFunds {
  const needsFunds = bondYocto !== null && bondYocto > 0n;
  const query = useQuery({ ...spendableYoctoQueryOptions(accountId), enabled: needsFunds });
  if (!needsFunds) return { enough: bondYocto !== null, status: "none", spendableYocto: null };
  if (query.isPending) return { enough: false, status: "loading", spendableYocto: null };
  if (query.isError) return { enough: false, status: "error", spendableYocto: null };
  return { enough: query.data >= bondYocto, status: "ready", spendableYocto: query.data };
}

function BondNotice({
  accountId,
  bondYocto,
  funds,
}: {
  accountId: string;
  bondYocto: bigint | null;
  funds: BondFunds;
}) {
  const translate = useAppTranslation();
  if (bondYocto === null) {
    return (
      <p role="alert" className="text-sm text-destructive" data-testid="member-dao.bond-unknown">
        {translate("memberDao.bondUnavailable")}
      </p>
    );
  }
  if (bondYocto === 0n) return null;
  const bond = yoctoToNearInput(bondYocto);
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="member-dao.bond">
      <p className="text-muted-foreground">{translate("memberDao.bond", { amount: bond })}</p>
      {funds.status === "error" ? (
        <p role="alert" className="text-destructive">
          {translate("memberDao.balanceError")}
        </p>
      ) : funds.status === "ready" && !funds.enough ? (
        <p role="alert" className="text-destructive" data-testid="member-dao.insufficient">
          {translate("memberDao.insufficient", {
            amount: yoctoToNearInput(bondYocto - (funds.spendableYocto ?? 0n)),
          })}{" "}
          <span className="font-mono break-all">{accountId}</span>
        </p>
      ) : null}
    </div>
  );
}

function PanelNotice({
  icon: Icon,
  tone = "muted",
  testId,
  children,
}: {
  icon: typeof WarningIcon;
  tone?: "muted" | "error";
  testId: string;
  children: ReactNode;
}) {
  return (
    <Item variant="muted" data-testid={testId}>
      <ItemMedia variant="icon">
        <Icon className={tone === "error" ? "text-destructive" : "text-muted-foreground"} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemDescription
          className={`line-clamp-none ${tone === "error" ? "text-destructive" : ""}`}
          role={tone === "error" ? "alert" : undefined}
        >
          {children}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

/**
 * Approve and reject on an open poll, for a Contributor whose policy lets
 * them vote on polls. Hidden for everyone else; signers vote in Trezu.
 */
export function PollVote({
  daoAccountId,
  proposal,
}: {
  daoAccountId: string;
  proposal: SputnikProposal;
}) {
  const translate = useAppTranslation();
  const accountId = useNearAccount();
  const queryClient = useQueryClient();
  const policyQuery = useQuery({ ...daoPolicyQueryOptions(daoAccountId), enabled: !!accountId });
  const signing = useMemberSigning<unknown>(accountId);
  const [action, setAction] = useState<SputnikVoteAction | null>(null);
  const access = pollVoteAccess(policyQuery.data, accountId, proposal);

  if (access.status === "hidden") return null;
  if (access.status === "voted") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="poll-vote.voted">
        {translate(voteMessage(access.vote))}
      </p>
    );
  }

  const busy = signing.state.status === "connecting" || signing.state.status === "signing";
  const vote = (next: SputnikVoteAction) => {
    setAction(next);
    void signing
      .submit((wallet) => voteOnProposal(wallet, daoAccountId, proposal, next))
      .then(() => queryClient.invalidateQueries({ queryKey: ["node-dao"] }))
      .catch(() => {});
  };

  return (
    <div className="flex flex-col gap-2" data-testid="poll-vote">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || signing.state.status === "submitted"}
          onClick={() => vote("VoteApprove")}
          data-testid="poll-vote.approve"
        >
          {translate("common.approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || signing.state.status === "submitted"}
          onClick={() => vote("VoteReject")}
          data-testid="poll-vote.reject"
        >
          {translate("common.reject")}
        </Button>
      </div>
      <MemberSigningStatus
        state={signing.state}
        onRetry={action ? () => vote(action) : undefined}
      />
    </div>
  );
}

function voteMessage(vote: "Approve" | "Reject" | "Remove"): Parameters<Translate>[0] {
  if (vote === "Approve") return "pollVote.votedApprove";
  if (vote === "Reject") return "pollVote.votedReject";
  return "pollVote.votedRemove";
}
