import { PLATFORM_SUPPORT_ACCESS_ROLE } from "@/lib/platform-support-session-cookie";

export const APPLICATION_ROLES = [
  "owner",
  "admin",
  "manager",
  "center_manager",
  "document_admin",
  "payroll_manager",
  "coach",
  "staff",
] as const;

export const MANAGED_ACCESS_ROLES = [
  "owner",
  "admin",
  "manager",
  "coach",
] as const;

export type ApplicationRole = (typeof APPLICATION_ROLES)[number];
export type ManagedAccessRole = (typeof MANAGED_ACCESS_ROLES)[number];

const ROLE_LABELS: Record<ApplicationRole, string> = {
  admin: "Administrador",
  center_manager: "Responsable de centro (futuro)",
  coach: "Entrenador",
  document_admin: "Responsable documental (futuro)",
  manager: "Responsable",
  owner: "Propietario",
  payroll_manager: "Responsable de nóminas (futuro)",
  staff: "Personal (futuro)",
};

const TENANT_SETTINGS_ROLES: ApplicationRole[] = ["owner", "admin"];
const TENANT_BILLING_READ_ROLES: ApplicationRole[] = ["owner", "admin"];
const CERTIFICATION_MANAGEMENT_ROLES: ApplicationRole[] = ["owner", "admin"];
const TIME_TRACKING_SETTINGS_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];
const OPERATIONAL_MANAGEMENT_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];
const TEAM_ACCESS_MANAGEMENT_ROLES: ApplicationRole[] = ["owner", "admin"];
const TEAM_PROFILE_DELETE_ROLES: ApplicationRole[] = ["owner"];
const TIME_TRACKING_REVIEW_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];
const TIME_LOCATION_SETTINGS_MANAGEMENT_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
];
const TIME_LOCATION_SETTINGS_ACTIVATION_ROLES: ApplicationRole[] = ["owner"];
const CHANGE_REQUEST_MANAGEMENT_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];
const ABSENCE_SELF_SERVICE_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
  "coach",
];
const ABSENCE_REQUEST_MANAGEMENT_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];
const STAFF_WORK_WINDOW_MANAGEMENT_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];
const OPERATIONAL_EVENT_READ_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
  "coach",
];
const OPERATIONAL_EVENT_MANAGEMENT_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];
const OVERTIME_CANDIDATE_REVIEW_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];

export function isApplicationRole(role: string): role is ApplicationRole {
  return APPLICATION_ROLES.includes(role as ApplicationRole);
}

export function isManagedAccessRole(role: string): role is ManagedAccessRole {
  return MANAGED_ACCESS_ROLES.includes(role as ManagedAccessRole);
}

function isPlatformSupportRole(role: string) {
  return role === PLATFORM_SUPPORT_ACCESS_ROLE;
}

export function getApplicationRoleLabel(role: string) {
  if (isPlatformSupportRole(role)) {
    return "Soporte BoxOps";
  }

  return isApplicationRole(role) ? ROLE_LABELS[role] : role;
}

export function canManageTenantSettings(role: string) {
  return TENANT_SETTINGS_ROLES.includes(role as ApplicationRole);
}

export function canReadTenantBilling(role: string) {
  return TENANT_BILLING_READ_ROLES.includes(role as ApplicationRole);
}

export function canManageCertifications(role: string) {
  return CERTIFICATION_MANAGEMENT_ROLES.includes(role as ApplicationRole);
}

export function canManageTimeTrackingSettings(role: string) {
  return TIME_TRACKING_SETTINGS_ROLES.includes(role as ApplicationRole);
}

export function canManageOperationalData(role: string) {
  return (
    OPERATIONAL_MANAGEMENT_ROLES.includes(role as ApplicationRole) ||
    isPlatformSupportRole(role)
  );
}

export function canManageOperationalTeamProfiles(role: string) {
  return (
    OPERATIONAL_MANAGEMENT_ROLES.includes(role as ApplicationRole) ||
    isPlatformSupportRole(role)
  );
}

export function canDeleteOperationalTeamProfiles(role: string) {
  return TEAM_PROFILE_DELETE_ROLES.includes(role as ApplicationRole);
}

export function canManageTeamAccess(role: string) {
  return (
    TEAM_ACCESS_MANAGEMENT_ROLES.includes(role as ApplicationRole) ||
    isPlatformSupportRole(role)
  );
}

export function canReadOperationalData(role: string) {
  return isApplicationRole(role) || isPlatformSupportRole(role);
}

export function canUsePersonalFeatures(role: string) {
  return isApplicationRole(role);
}

export function canReviewTimeTracking(role: string) {
  return TIME_TRACKING_REVIEW_ROLES.includes(role as ApplicationRole);
}

export function canManageTimeLocationSettings(role: string) {
  return TIME_LOCATION_SETTINGS_MANAGEMENT_ROLES.includes(role as ApplicationRole);
}

export function canActivateTimeLocationSettings(role: string) {
  return TIME_LOCATION_SETTINGS_ACTIVATION_ROLES.includes(role as ApplicationRole);
}

export function canManageChangeRequests(role: string) {
  return CHANGE_REQUEST_MANAGEMENT_ROLES.includes(role as ApplicationRole);
}

export function canUseAbsenceSelfService(role: string) {
  return ABSENCE_SELF_SERVICE_ROLES.includes(role as ApplicationRole);
}

export function canManageAbsenceRequests(role: string) {
  return ABSENCE_REQUEST_MANAGEMENT_ROLES.includes(role as ApplicationRole);
}

export function canManageStaffWorkWindows(role: string) {
  return (
    STAFF_WORK_WINDOW_MANAGEMENT_ROLES.includes(role as ApplicationRole) ||
    isPlatformSupportRole(role)
  );
}

export function canReadOperationalEvents(role: string) {
  return (
    OPERATIONAL_EVENT_READ_ROLES.includes(role as ApplicationRole) ||
    isPlatformSupportRole(role)
  );
}

export function canManageOperationalEvents(role: string) {
  return (
    OPERATIONAL_EVENT_MANAGEMENT_ROLES.includes(role as ApplicationRole) ||
    isPlatformSupportRole(role)
  );
}

export function canReadOvertimeCandidates(role: string) {
  return isApplicationRole(role);
}

export function canReviewOvertimeCandidates(role: string) {
  return OVERTIME_CANDIDATE_REVIEW_ROLES.includes(role as ApplicationRole);
}
