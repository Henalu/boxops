import type { User } from "@supabase/supabase-js";

import {
  APPLICATION_ROLES,
  isApplicationRole,
  type ApplicationRole,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type MembershipRow = Tables<"organization_memberships">;
type OrganizationRow = Tables<"organizations">;
type ApplicationMembershipRow = Omit<MembershipRow, "role"> & {
  role: ApplicationRole;
};

const ACTIVE_ORGANIZATION_STATUSES = ["trialing", "active"] as const;

export type ActiveOrganization = Pick<
  OrganizationRow,
  | "id"
  | "name"
  | "slug"
  | "status"
  | "theme_config"
  | "time_tracking_config"
  | "timezone"
>;

export type ActiveMembership = Pick<
  MembershipRow,
  "id" | "organization_id" | "user_id" | "status" | "joined_at" | "created_at"
> & {
  role: ApplicationRole;
  organization: ActiveOrganization;
};

export type ActiveOrganizationResolution =
  | {
      ok: true;
      membership: ActiveMembership;
      organization: ActiveOrganization;
    }
  | {
      ok: false;
      reason:
        | "no_active_memberships"
        | "organization_required"
        | "organization_not_found";
      memberships: ActiveMembership[];
    };

function isUsableOrganizationStatus(status: string) {
  return ACTIVE_ORGANIZATION_STATUSES.includes(
    status as (typeof ACTIVE_ORGANIZATION_STATUSES)[number],
  );
}

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getActiveMemberships(
  userId: string,
): Promise<ActiveMembership[]> {
  const supabase = await createClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, status, joined_at, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", [...APPLICATION_ROLES])
    .order("created_at", { ascending: true });

  if (membershipsError) {
    throw new Error(
      `Could not load active organization memberships: ${membershipsError.message}`,
    );
  }

  const validMemberships = memberships.flatMap((membership) => {
    if (!isApplicationRole(membership.role)) {
      return [];
    }

    return [membership as ApplicationMembershipRow];
  });

  if (validMemberships.length === 0) {
    return [];
  }

  const organizationIds = validMemberships.map(
    (membership) => membership.organization_id,
  );

  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id, name, slug, status, timezone, theme_config, time_tracking_config")
    .in("id", organizationIds);

  if (organizationsError) {
    throw new Error(
      `Could not load active organizations: ${organizationsError.message}`,
    );
  }

  const organizationsById = new Map(
    organizations
      .filter((organization) => isUsableOrganizationStatus(organization.status))
      .map((organization) => [organization.id, organization]),
  );

  return validMemberships.flatMap((membership) => {
    const organization = organizationsById.get(membership.organization_id);

    if (!organization) {
      return [];
    }

    return [
      {
        id: membership.id,
        organization_id: membership.organization_id,
        user_id: membership.user_id,
        role: membership.role,
        status: membership.status,
        joined_at: membership.joined_at,
        created_at: membership.created_at,
        organization,
      },
    ];
  });
}

export function resolveActiveOrganization(
  memberships: ActiveMembership[],
  organizationId?: string | null,
): ActiveOrganizationResolution {
  if (memberships.length === 0) {
    return {
      ok: false,
      reason: "no_active_memberships",
      memberships,
    };
  }

  if (organizationId) {
    const membership = memberships.find(
      (candidate) => candidate.organization_id === organizationId,
    );

    if (!membership) {
      return {
        ok: false,
        reason: "organization_not_found",
        memberships,
      };
    }

    return {
      ok: true,
      membership,
      organization: membership.organization,
    };
  }

  if (memberships.length !== 1) {
    return {
      ok: false,
      reason: "organization_required",
      memberships,
    };
  }

  const [membership] = memberships;

  return {
    ok: true,
    membership,
    organization: membership.organization,
  };
}
