import {
  CheckCircleIcon,
  CircleIcon,
  GavelIcon,
  LinkBreakIcon,
  LinkIcon,
  StackIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import type { ComponentType, ReactNode } from "react";
import { Button, Field, FieldLabel, InfoPopover, type InfoPopoverLink, Input } from "@/components";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { maxMinusOneNear, yoctoToNearInput } from "@/lib/team-unstake";
import { formatNear, nearblocksAccount } from "./-poc-chain";
import type { PocForm } from "./-poc-form";
import { POOL_PLACEHOLDER, type PocLifecycle, TREZU_CREATE_URL } from "./-poc-lifecycle";

function ReadOnlyField({
  id,
  label,
  value,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        disabled
        readOnly
        className="font-mono"
        data-testid={id}
      />
    </Field>
  );
}

type PocFormFieldName = "name" | "pool" | "endowment" | "sponsorAmount";

function PocFormField({
  form,
  name,
  label,
  type,
  placeholder,
  mono,
  description,
}: {
  form: PocForm;
  name: PocFormFieldName;
  label: string;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  description?: ReactNode;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <Field>
          <FieldLabel htmlFor={`poc-${name}`}>{label}</FieldLabel>
          <Input
            id={`poc-${name}`}
            type={type}
            value={field.state.value}
            placeholder={placeholder}
            onChange={(event) => field.handleChange(event.target.value)}
            className={mono ? "font-mono" : undefined}
            data-testid={`poc-${name}`}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
        </Field>
      )}
    </form.Field>
  );
}

function ConnectField({
  id,
  label,
  connecting,
  onClick,
  testId,
  children,
}: {
  id: string;
  label: string;
  connecting: boolean;
  onClick: () => void;
  testId: string;
  children: string;
}) {
  const translate = useAppTranslation();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Button
        id={id}
        variant="outline"
        className="w-full justify-start"
        onClick={onClick}
        disabled={connecting}
        data-testid={testId}
      >
        {connecting ? translate("wallet.connecting") : children}
      </Button>
    </Field>
  );
}

function ActorRow({
  icon: Icon,
  label,
  account,
  connected,
  popover,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  account: string | null;
  connected: boolean;
  popover: { title: string; body: string; links: InfoPopoverLink[] };
}) {
  const translate = useAppTranslation();
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3"
      data-testid={`poc-actor-${label}`}
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {account ?? translate("lifecycle.notSet")}
        </span>
      </div>
      {connected ? (
        <CheckCircleIcon
          className="size-4 shrink-0 text-success"
          weight="fill"
          aria-label={translate("lifecycle.connectedLower")}
        />
      ) : (
        <CircleIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-label={translate("lifecycle.disconnectedLower")}
        />
      )}
      <InfoPopover title={popover.title} body={popover.body} links={popover.links} />
    </div>
  );
}

export function PocActors({ lc }: { lc: PocLifecycle }) {
  const translate = useAppTranslation();
  const { sessionAccount, team, endowment, connection, sessionCanProposeEndowment } = lc;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <ActorRow
        icon={WalletIcon}
        label={translate("lifecycle.you")}
        account={sessionAccount}
        connected={!!sessionAccount}
        popover={{
          title: translate("lifecycle.you"),
          body: translate("lifecycle.walletDescription"),
          links: sessionAccount
            ? [
                {
                  label: translate("lifecycle.nearblocksAccount", {
                    account: sessionAccount ?? "",
                  }),
                  href: nearblocksAccount(sessionAccount),
                },
              ]
            : [],
        }}
      />
      <ActorRow
        icon={GavelIcon}
        label={translate("org.team")}
        account={team || null}
        connected={connection.daoAccountId === team && !!team}
        popover={{
          title: translate("org.team"),
          body: translate("lifecycle.daoDescription"),
          links: [
            { label: translate("lifecycle.deployTrezu"), href: TREZU_CREATE_URL },
            ...(team
              ? [
                  {
                    label: translate("lifecycle.nearblocksAccount", { account: team ?? "" }),
                    href: nearblocksAccount(team),
                  },
                ]
              : []),
          ],
        }}
      />
      <ActorRow
        icon={StackIcon}
        label={translate("lifecycle.endowment")}
        account={endowment || null}
        connected={
          !!endowment && (sessionCanProposeEndowment || connection.daoAccountId === endowment)
        }
        popover={{
          title: translate("lifecycle.sponsor"),
          body: translate("lifecycle.sponsorDescription"),
          links: endowment
            ? [
                { label: translate("lifecycle.viewTrezu"), href: `https://trezu.app/${endowment}` },
                {
                  label: translate("lifecycle.nearblocksAccount", { account: endowment ?? "" }),
                  href: nearblocksAccount(endowment),
                },
              ]
            : [],
        }}
      />
    </div>
  );
}

export function PocTreasuryConnection({ lc }: { lc: PocLifecycle }) {
  const translate = useAppTranslation();
  const { connection } = lc;
  if (!connection.daoAccountId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="poc-treasury">
        <span className="text-sm text-muted-foreground">
          {translate("lifecycle.noTreasury")}{" "}
          <a
            href={TREZU_CREATE_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            {translate("lifecycle.createTrezu")}
          </a>
        </span>
        <Button
          variant="outline"
          onClick={() => void connection.connect().catch(() => {})}
          disabled={connection.status === "connecting"}
          data-testid="poc-connect"
        >
          {connection.status === "connecting"
            ? translate("wallet.connecting")
            : translate("lifecycle.connectTreasury")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="poc-treasury">
      <span className="min-w-0 text-sm text-muted-foreground">
        {translate("lifecycle.trezuConnected", { account: connection.daoAccountId ?? "" })}
      </span>
      <Button
        variant="ghost"
        onClick={() => void connection.disconnect()}
        data-testid="poc-disconnect"
      >
        {translate("common.disconnect")}
      </Button>
    </div>
  );
}

function SponsorAmountField({ lc }: { lc: PocLifecycle }) {
  const { locale } = useAppLocale();
  const translate = useAppTranslation();
  const { form, endowmentAvailableYocto } = lc;
  /** Fills what the lockup can stake, minus a 1 NEAR safety margin. */
  const maxFill = endowmentAvailableYocto != null ? maxMinusOneNear(endowmentAvailableYocto) : null;
  return (
    <form.Field name="sponsorAmount">
      {(field) => (
        <Field>
          <FieldLabel htmlFor="poc-sponsorAmount">{translate("lifecycle.sponsorNear")}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="poc-sponsorAmount"
              inputMode="decimal"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              data-testid="poc-sponsorAmount"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                onClick={() => {
                  if (maxFill != null)
                    form.setFieldValue("sponsorAmount", yoctoToNearInput(maxFill));
                }}
                disabled={maxFill == null}
                data-testid="poc-sponsorAmount-max"
              >
                {translate("stake.max")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>
            {endowmentAvailableYocto != null
              ? translate("lifecycle.lockupAvailable", {
                  amount: formatNear(endowmentAvailableYocto.toString(), locale),
                })
              : translate("lifecycle.setEndowmentHint")}
          </FieldDescription>
        </Field>
      )}
    </form.Field>
  );
}

export function PocSetupFields({ lc }: { lc: PocLifecycle }) {
  const translate = useAppTranslation();
  const { form, values, slug, team, connection, connectTeamDaoMutation, connectEndowmentMutation } =
    lc;
  const connecting = connection.status === "connecting";
  return (
    <FieldGroup className="grid sm:grid-cols-2 lg:grid-cols-3">
      <PocFormField
        form={form}
        name="name"
        label={translate("tenant.nodeName")}
        placeholder={translate("lifecycle.nodeExample")}
      />
      <ReadOnlyField
        id="poc-slug"
        label={translate("lifecycle.nodeSlug")}
        value={slug}
        placeholder={translate("lifecycle.chooseOrgLower")}
      />
      {team ? (
        <ReadOnlyField id="poc-team" label={translate("lifecycle.teamWallet")} value={team} />
      ) : (
        <ConnectField
          id="poc-team"
          label={translate("lifecycle.teamWallet")}
          connecting={connectTeamDaoMutation.isPending || connecting}
          onClick={() => connectTeamDaoMutation.mutate()}
          testId="poc-connect-team"
        >
          {translate("lifecycle.connectTeamDao")}
        </ConnectField>
      )}
      <div className="flex flex-col gap-1">
        {values.endowmentLinked ? (
          <ReadOnlyField
            id="poc-endowment"
            label={translate("lifecycle.endowmentTreasury")}
            value={team}
          />
        ) : (
          <>
            <PocFormField
              form={form}
              name="endowment"
              label={translate("lifecycle.endowmentTreasury")}
              placeholder="chicagonode.sputnik-dao.near"
              mono
              description={translate("lifecycle.treasuryPolicyHint")}
            />
            <Button
              type="button"
              variant="link"
              size="xs"
              className="self-start"
              onClick={() => connectEndowmentMutation.mutate()}
              disabled={connectEndowmentMutation.isPending || connecting}
              data-testid="poc-connect-endowment"
            >
              <WalletIcon />
              {translate("lifecycle.connectViaTrezu")}
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="link"
          size="xs"
          className="self-start"
          onClick={() => form.setFieldValue("endowmentLinked", !values.endowmentLinked)}
          data-testid="poc-link-treasuries"
        >
          {values.endowmentLinked ? (
            <>
              <LinkIcon />
              {translate("lifecycle.sameTeam")}
            </>
          ) : (
            <>
              <LinkBreakIcon />
              {translate("lifecycle.separateTreasuries")}
            </>
          )}
        </Button>
      </div>
      <PocFormField
        form={form}
        name="pool"
        label={translate("stake.stakingPool")}
        placeholder={POOL_PLACEHOLDER}
        mono
      />
      <SponsorAmountField lc={lc} />
    </FieldGroup>
  );
}
