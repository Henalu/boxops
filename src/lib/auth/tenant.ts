import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import {
  APPLICATION_ROLES,
  isApplicationRole,
  type ApplicationRole,
} from "@/lib/auth/permissions";
import {
  PLATFORM_SUPPORT_ACCESS_ROLE,
  PLATFORM_SUPPORT_SESSION_COOKIE_NAME,
  type PlatformSupportAccessRole,
} from "@/lib/platform-support-session-cookie";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type MembershipRow = Tables<"organization_memberships">;
type OrganizationRow = Tables<"organizations">;
type ApplicationMembershipRow = Omit<MembershipRow, "role"> & {
  role: ApplicationRole;
};
type ActiveMembershipRole = ApplicationRole | PlatformSupportAccessRole;
type ActivePlatformSupportSessionRow = {
  actor_user_id: string;
  expires_at: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  organization_status: string;
  organization_theme_config: OrganizationRow["theme_config"];
  organization_time_tracking_config: OrganizationRow["time_tracking_config"];
  organization_timezone: string;
  platform_admin_id: string;
  platform_role: string;
  started_at: string;
  support_scope: string;
  support_session_id: string;
};
type DatabaseErrorLike = {
  message?: string;
};
type QueryResponse<T> = {
  data: T | null;
  error: DatabaseErrorLike | null;
};
type UntypedTenantClient = {
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResponse<T>>;
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
  accessMode: "membership" | "platform_support";
  platformSupportSession?: {
    expiresAt: string;
    platformAdminId: string;
    platformRole: string;
    startedAt: string;
    supportSessionId: string;
  };
  role: ActiveMembershipRole;
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

function getTenantClient(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as UntypedTenantClient;
}

async function getPlatformSupportMembership({
  supabase,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}): Promise<ActiveMembership | null> {
  const cookieStore = await cookies();
  const supportSessionId = cookieStore.get(
    PLATFORM_SUPPORT_SESSION_COOKIE_NAME,
  )?.value;

  if (!supportSessionId) {
    return null;
  }

  const db = getTenantClient(supabase);
  const { data, error } = await db.rpc<ActivePlatformSupportSessionRow[]>(
    "get_active_platform_support_session",
    {
      target_support_session_id: supportSessionId,
    },
  );

  if (error) {
    throw new Error(
      `Could not load active platform support session: ${error.message ?? "unknown error"}`,
    );
  }

  const [supportSession] = data ?? [];

  if (
    !supportSession ||
    supportSession.actor_user_id !== userId ||
    !isUsableOrganizationStatus(supportSession.organization_status)
  ) {
    return null;
  }

  return {
    accessMode: "platform_support",
    created_at: supportSession.started_at,
    id: supportSession.support_session_id,
    joined_at: supportSession.started_at,
    organization: {
      id: supportSession.organization_id,
      name: supportSession.organization_name,
      slug: supportSession.organization_slug,
      status: supportSession.organization_status,
      theme_config: supportSession.organization_theme_config,
      time_tracking_config: supportSession.organization_time_tracking_config,
      timezone: supportSession.organization_timezone,
    },
    organization_id: supportSession.organization_id,
    platformSupportSession: {
      expiresAt: supportSession.expires_at,
      platformAdminId: supportSession.platform_admin_id,
      platformRole: supportSession.platform_role,
      startedAt: supportSession.started_at,
      supportSessionId: supportSession.support_session_id,
    },
    role: PLATFORM_SUPPORT_ACCESS_ROLE,
    status: "active",
    user_id: userId,
  };
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
    const supportMembership = await getPlatformSupportMembership({
      supabase,
      userId,
    });

    return supportMembership ? [supportMembership] : [];
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

  const activeMemberships = validMemberships.flatMap((membership) => {
    const organization = organizationsById.get(membership.organization_id);

    if (!organization) {
      return [];
    }

    return [
      {
        accessMode: "membership" as const,
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

  const supportMembership = await getPlatformSupportMembership({
    supabase,
    userId,
  });

  if (!supportMembership) {
    return activeMemberships;
  }

  return [
    supportMembership,
    ...activeMemberships.filter(
      (membership) =>
        membership.organization_id !== supportMembership.organization_id,
    ),
  ];
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
