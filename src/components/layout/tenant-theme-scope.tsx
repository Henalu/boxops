"use client";

import type React from "react";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import {
  getTenantThemeCssVariables,
  type TenantThemeCssVariables,
} from "@/lib/organizations";
import type { Json } from "@/types/supabase";

type TenantThemeOrganization = {
  id: string;
  themeConfig: Json;
};

type TenantThemeScopeProps = {
  children: React.ReactNode;
  organizations: TenantThemeOrganization[];
};

type TenantThemeStyle = React.CSSProperties & TenantThemeCssVariables;

function resolveThemeOrganization(
  organizations: TenantThemeOrganization[],
  organizationId: string | null,
) {
  if (organizationId) {
    return organizations.find((organization) => organization.id === organizationId);
  }

  return organizations.length === 1 ? organizations[0] : undefined;
}

export function TenantThemeScope({
  children,
  organizations,
}: TenantThemeScopeProps) {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId");

  const style = useMemo<TenantThemeStyle | undefined>(() => {
    const organization = resolveThemeOrganization(organizations, organizationId);
    const themeVariables = getTenantThemeCssVariables(organization?.themeConfig);

    return themeVariables as TenantThemeStyle | undefined;
  }, [organizationId, organizations]);

  return (
    <div data-tenant-theme={style ? "custom" : "boxops"} style={style}>
      {children}
    </div>
  );
}
