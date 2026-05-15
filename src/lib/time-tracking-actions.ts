"use server";

import {
  applyTimeCorrection,
  approveTimeWeeklyApproval,
  createAndApplyOwnTimeCorrection,
  createOwnTimePunch,
  generateScheduleAutoTimePunches,
  rejectTimeWeeklyApproval,
  reopenTimeWeeklyApproval,
  requestOwnTimeCorrection,
  reviewTimeCorrection,
  submitTimeWeeklyApproval,
  type ApproveTimeWeeklyApprovalInput,
  type ApplyTimeCorrectionInput,
  type CreateAndApplyOwnTimeCorrectionInput,
  type CreateOwnTimePunchInput,
  type GenerateScheduleAutoTimePunchesInput,
  type RejectTimeWeeklyApprovalInput,
  type ReopenTimeWeeklyApprovalInput,
  type RequestOwnTimeCorrectionInput,
  type ReviewTimeCorrectionInput,
  type SubmitTimeWeeklyApprovalInput,
} from "@/lib/time-tracking";

export async function createOwnTimePunchAction(
  input: CreateOwnTimePunchInput,
) {
  return createOwnTimePunch(input);
}

export async function requestOwnTimeCorrectionAction(
  input: RequestOwnTimeCorrectionInput,
) {
  return requestOwnTimeCorrection(input);
}

export async function createAndApplyOwnTimeCorrectionAction(
  input: CreateAndApplyOwnTimeCorrectionInput,
) {
  return createAndApplyOwnTimeCorrection(input);
}

export async function reviewTimeCorrectionAction(
  input: ReviewTimeCorrectionInput,
) {
  return reviewTimeCorrection(input);
}

export async function applyTimeCorrectionAction(
  input: ApplyTimeCorrectionInput,
) {
  return applyTimeCorrection(input);
}

export async function submitTimeWeeklyApprovalAction(
  input: SubmitTimeWeeklyApprovalInput,
) {
  return submitTimeWeeklyApproval(input);
}

export async function approveTimeWeeklyApprovalAction(
  input: ApproveTimeWeeklyApprovalInput,
) {
  return approveTimeWeeklyApproval(input);
}

export async function rejectTimeWeeklyApprovalAction(
  input: RejectTimeWeeklyApprovalInput,
) {
  return rejectTimeWeeklyApproval(input);
}

export async function reopenTimeWeeklyApprovalAction(
  input: ReopenTimeWeeklyApprovalInput,
) {
  return reopenTimeWeeklyApproval(input);
}

export async function generateScheduleAutoTimePunchesAction(
  input: GenerateScheduleAutoTimePunchesInput,
) {
  return generateScheduleAutoTimePunches(input);
}
