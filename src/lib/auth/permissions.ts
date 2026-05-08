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
  admin: "Admin compatible",
  center_manager: "Responsable de centro (futuro)",
  coach: "Coach",
  document_admin: "Documentos (futuro)",
  manager: "Manager operativo",
  owner: "Owner",
  payroll_manager: "Nominas (futuro)",
  staff: "Staff (futuro)",
};

const TENANT_SETTINGS_ROLES: ApplicationRole[] = ["owner", "admin"];
const OPERATIONAL_MANAGEMENT_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "manager",
];
const TEAM_ACCESS_MANAGEMENT_ROLES: ApplicationRole[] = ["owner", "admin"];

export function isApplicationRole(role: string): role is ApplicationRole {
  return APPLICATION_ROLES.includes(role as ApplicationRole);
}

export function isManagedAccessRole(role: string): role is ManagedAccessRole {
  return MANAGED_ACCESS_ROLES.includes(role as ManagedAccessRole);
}

export function getApplicationRoleLabel(role: string) {
  return isApplicationRole(role) ? ROLE_LABELS[role] : role;
}

export function canManageTenantSettings(role: string) {
  return TENANT_SETTINGS_ROLES.includes(role as ApplicationRole);
}

export function canManageOperationalData(role: string) {
  return OPERATIONAL_MANAGEMENT_ROLES.includes(role as ApplicationRole);
}

export function canManageOperationalTeamProfiles(role: string) {
  return OPERATIONAL_MANAGEMENT_ROLES.includes(role as ApplicationRole);
}

export function canManageTeamAccess(role: string) {
  return TEAM_ACCESS_MANAGEMENT_ROLES.includes(role as ApplicationRole);
}

export function canReadOperationalData(role: string) {
  return isApplicationRole(role);
}

export function canUsePersonalFeatures(role: string) {
  return isApplicationRole(role);
}
