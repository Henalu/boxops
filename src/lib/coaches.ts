import {
  MANAGED_ACCESS_ROLES,
  getApplicationRoleLabel,
  isManagedAccessRole,
  type ManagedAccessRole,
} from "@/lib/auth/permissions";
import { isPostgresUuid } from "@/lib/uuid";

export const MEMBERSHIP_ROLES = MANAGED_ACCESS_ROLES;
export const MEMBERSHIP_STATUSES = [
  "invited",
  "active",
  "inactive",
  "suspended",
] as const;
export const COACH_PROFILE_STATUSES = ["active", "inactive"] as const;

export type MembershipRole = ManagedAccessRole;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type CoachProfileStatus = (typeof COACH_PROFILE_STATUSES)[number];

type MembershipFormValues = {
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
};

type CoachProfileCreateValues = CoachProfileEditableValues & {
  userId: string;
};

type CoachAccountLinkValues = MembershipFormValues & {
  coachProfileId: string;
};

type CoachProfileEditableValues = {
  primaryCenterId: string | null;
  weeklyContractedHours: number;
  status: CoachProfileStatus;
  notes: string | null;
};

export type MembershipValidationResult =
  | {
      ok: true;
      values: MembershipFormValues;
    }
  | {
      ok: false;
      error: "missing-fields" | "invalid-user-id" | "invalid-role" | "invalid-status";
    };

export type CoachProfileCreateValidationResult =
  | {
      ok: true;
      values: CoachProfileCreateValues;
    }
  | {
      ok: false;
      error:
        | "missing-fields"
        | "invalid-user-id"
        | "invalid-center"
        | "invalid-hours"
        | "invalid-status"
        | "notes-too-long";
    };

export type CoachProfileUpdateValidationResult =
  | {
      ok: true;
      values: CoachProfileEditableValues;
    }
  | {
      ok: false;
      error:
        | "missing-fields"
        | "invalid-center"
        | "invalid-hours"
        | "invalid-status"
        | "notes-too-long";
    };

export type CoachAccountLinkValidationResult =
  | {
      ok: true;
      values: CoachAccountLinkValues;
    }
  | {
      ok: false;
      error:
        | "invalid-profile-id"
        | "invalid-role"
        | "invalid-status"
        | "invalid-user-id"
        | "missing-fields";
    };

export function isUuid(value: string) {
  return isPostgresUuid(value);
}

export function isMembershipRole(value: string): value is MembershipRole {
  return isManagedAccessRole(value);
}

export function isMembershipStatus(value: string): value is MembershipStatus {
  return MEMBERSHIP_STATUSES.includes(value as MembershipStatus);
}

export function isCoachProfileStatus(
  value: string,
): value is CoachProfileStatus {
  return COACH_PROFILE_STATUSES.includes(value as CoachProfileStatus);
}

export function getMembershipRoleLabel(role: string) {
  return getApplicationRoleLabel(role);
}

export function getMembershipStatusLabel(status: string) {
  const labels: Record<MembershipStatus, string> = {
    active: "Activo",
    inactive: "Inactivo",
    invited: "Pendiente",
    suspended: "Suspendido",
  };

  return isMembershipStatus(status) ? labels[status] : status;
}

export function getCoachProfileStatusLabel(status: string) {
  return status === "inactive" ? "Inactivo" : "Activo";
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalUuid(value: string) {
  if (!value || value === "none") {
    return null;
  }

  return isUuid(value) ? value : undefined;
}

function parseHours(value: string) {
  const normalized = value.replace(",", ".");
  const hours = Number(normalized);

  if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
    return null;
  }

  return Math.round(hours * 100) / 100;
}

function validateCoachProfileEditableForm(
  formData: FormData,
): CoachProfileUpdateValidationResult {
  const rawPrimaryCenterId = getFormString(formData, "primaryCenterId");
  const rawHours = getFormString(formData, "weeklyContractedHours");
  const rawStatus = getFormString(formData, "status") || "active";
  const notes = getFormString(formData, "notes");
  const primaryCenterId = parseOptionalUuid(rawPrimaryCenterId);
  const weeklyContractedHours = parseHours(rawHours || "0");

  if (primaryCenterId === undefined) {
    return {
      ok: false,
      error: "invalid-center",
    };
  }

  if (weeklyContractedHours === null) {
    return {
      ok: false,
      error: "invalid-hours",
    };
  }

  if (!isCoachProfileStatus(rawStatus)) {
    return {
      ok: false,
      error: "invalid-status",
    };
  }

  if (notes.length > 1000) {
    return {
      ok: false,
      error: "notes-too-long",
    };
  }

  return {
    ok: true,
    values: {
      primaryCenterId,
      weeklyContractedHours,
      status: rawStatus,
      notes: notes || null,
    },
  };
}

export function validateMembershipForm(
  formData: FormData,
): MembershipValidationResult {
  const userId = getFormString(formData, "userId");
  const rawRole = getFormString(formData, "role") || "coach";
  const rawStatus = getFormString(formData, "status") || "active";

  if (!userId || !rawRole || !rawStatus) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!isUuid(userId)) {
    return {
      ok: false,
      error: "invalid-user-id",
    };
  }

  if (!isMembershipRole(rawRole)) {
    return {
      ok: false,
      error: "invalid-role",
    };
  }

  if (!isMembershipStatus(rawStatus)) {
    return {
      ok: false,
      error: "invalid-status",
    };
  }

  return {
    ok: true,
    values: {
      userId,
      role: rawRole,
      status: rawStatus,
    },
  };
}

export function validateCoachProfileCreateForm(
  formData: FormData,
): CoachProfileCreateValidationResult {
  const userId = getFormString(formData, "userId");

  if (!userId) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!isUuid(userId)) {
    return {
      ok: false,
      error: "invalid-user-id",
    };
  }

  const editableValidation = validateCoachProfileEditableForm(formData);

  if (!editableValidation.ok) {
    return editableValidation;
  }

  return {
    ok: true,
    values: {
      ...editableValidation.values,
      userId,
    },
  };
}

export function validateCoachProfileUpdateForm(
  formData: FormData,
): CoachProfileUpdateValidationResult {
  return validateCoachProfileEditableForm(formData);
}

export function validateCoachAccountLinkForm(
  formData: FormData,
): CoachAccountLinkValidationResult {
  const coachProfileId = getFormString(formData, "coachProfileId");
  const membershipValidation = validateMembershipForm(formData);

  if (!coachProfileId) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!isUuid(coachProfileId)) {
    return {
      ok: false,
      error: "invalid-profile-id",
    };
  }

  if (!membershipValidation.ok) {
    return membershipValidation;
  }

  return {
    ok: true,
    values: {
      ...membershipValidation.values,
      coachProfileId,
    },
  };
}
