import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { type ClientRuntimeConfig, getAccount, useApiClient } from "@/app";
import { LocalDate } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { presentationLabel } from "@/lib/presentation-label";
import { organizationByIdQueryOptions } from "@/lib/queries/organizations";
import { tenantByAccountQueryOptions } from "@/lib/queries/tenants";
import { isSyntheticEmail } from "@/lib/synthetic-email";
import { useNearAccount } from "@/lib/use-near-account";

export interface RuntimeRow {
  id: string;
  label: string;
  value: ReactNode;
  mono?: boolean;
}

interface RuntimeUser {
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

export function useRuntimeRows({
  runtimeConfig,
  user,
}: {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  user?: RuntimeUser | null;
}): RuntimeRow[] {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const walletAccount = useNearAccount();
  const platformAccount = getAccount(runtimeConfig);
  const { data: tenant } = useQuery(tenantByAccountQueryOptions(apiClient, platformAccount));
  const { data: tenantOrganization } = useQuery({
    ...organizationByIdQueryOptions(apiClient, tenant?.orgId ?? ""),
    enabled: !!tenant?.orgId,
  });
  const tenantOrganizationSlug = tenantOrganization?.slug;
  const rows: RuntimeRow[] = [
    {
      id: "platform-account",
      label: translate("admin.platformAccount"),
      value: platformAccount,
      mono: true,
    },
  ];
  if (tenant) {
    rows.push(
      { id: "site", label: translate("common.site"), value: tenant.name },
      {
        id: "organization",
        label: translate("common.organization"),
        value: tenantOrganizationSlug ? (
          <Link
            to="/orgs/$slug"
            params={{ slug: tenantOrganizationSlug }}
            className="hover:underline"
          >
            {tenantOrganizationSlug}
          </Link>
        ) : (
          "—"
        ),
      },
    );
    if (tenant.createdAt) {
      rows.push({
        id: "created",
        label: translate("common.created"),
        value: <LocalDate value={tenant.createdAt} />,
      });
    }
  }
  rows.push(
    {
      id: "name",
      label: translate("common.name"),
      value: user?.name || (isSyntheticEmail(user?.email) ? null : user?.email) || "—",
    },
    {
      id: "role",
      label: translate("org.role"),
      value: user?.role ? presentationLabel(user.role, translate) : "—",
    },
    {
      id: "wallet",
      label: translate("common.wallet"),
      value: walletAccount ?? translate("wallet.notConnected"),
      mono: !!walletAccount,
    },
  );
  return rows;
}
