"use server";

import { redirect } from "next/navigation";

import {
  approveTimeWeeklyApprovalAction,
  rejectTimeWeeklyApprovalAction,
} from "@/lib/time-tracking-actions";
import { getAppPath } from "@/lib/navigation/app-paths";
import { isPostgresUuid } from "@/lib/uuid";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function isDateInput(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getRedirectWeekStart(formData: FormData) {
  const weekStart = getFormString(formData, "weekStart");

  return isDateInput(weekStart) ? weekStart : null;
}

function getHomeErrorPath(
  organizationId: string | null,
  error: string,
  weekStart?: string | null,
) {
  return getAppPath("/app", {
    error,
    organizationId,
    week: weekStart,
  });
}

function getHomeStatusPath(
  organizationId: string,
  status: string,
  weekStart?: string | null,
) {
  return getAppPath("/app", {
    organizationId,
    status,
    week: weekStart,
  });
}

export async function approveTimeWeeklyApprovalFromHome(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const weeklyApprovalId = getFormString(formData, "weeklyApprovalId");
  const approvalNote = getFormString(formData, "approvalNote");
  const weekStart = getRedirectWeekStart(formData);

  if (!organizationId) {
    redirect(getHomeErrorPath(null, "organization_required", weekStart));
  }

  if (!isPostgresUuid(organizationId)) {
    redirect(getHomeErrorPath(organizationId, "invalid_organization", weekStart));
  }

  if (!isPostgresUuid(weeklyApprovalId)) {
    redirect(
      getHomeErrorPath(organizationId, "invalid_weekly_approval", weekStart),
    );
  }

  const result = await approveTimeWeeklyApprovalAction({
    approvalNote: approvalNote || null,
    organizationId,
    weeklyApprovalId,
  });

  if (!result.ok) {
    redirect(getHomeErrorPath(organizationId, result.error, weekStart));
  }

  redirect(getHomeStatusPath(organizationId, "weekly-approval-approved", weekStart));
}

export async function rejectTimeWeeklyApprovalFromHome(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const weeklyApprovalId = getFormString(formData, "weeklyApprovalId");
  const rejectionNote = getFormString(formData, "rejectionNote");
  const weekStart = getRedirectWeekStart(formData);

  if (!organizationId) {
    redirect(getHomeErrorPath(null, "organization_required", weekStart));
  }

  if (!isPostgresUuid(organizationId)) {
    redirect(getHomeErrorPath(organizationId, "invalid_organization", weekStart));
  }

  if (!isPostgresUuid(weeklyApprovalId)) {
    redirect(
      getHomeErrorPath(organizationId, "invalid_weekly_approval", weekStart),
    );
  }

  if (!rejectionNote) {
    redirect(getHomeErrorPath(organizationId, "invalid_notes", weekStart));
  }

  const result = await rejectTimeWeeklyApprovalAction({
    organizationId,
    rejectionNote,
    rejectionStatus: "correction_required",
    weeklyApprovalId,
  });

  if (!result.ok) {
    redirect(getHomeErrorPath(organizationId, result.error, weekStart));
  }

  redirect(
    getHomeStatusPath(
      organizationId,
      "weekly-approval-correction-required",
      weekStart,
    ),
  );
}
