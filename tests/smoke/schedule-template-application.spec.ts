import { expect, test } from "@playwright/test";

import { applyScheduleTemplateWeek } from "../../src/lib/schedule-template-application";

type ApplicationClient = Parameters<typeof applyScheduleTemplateWeek>[0]["supabase"];

const input = {
  organizationId: "00000000-0000-4000-8000-000000970001",
  templateId: "00000000-0000-4000-8000-000000970071",
  timezone: "Europe/Madrid",
  weekStart: "2026-10-07",
};

test("template application uses one RPC and preserves the normalized week and replacement intent", async () => {
  const calls: unknown[] = [];
  const expected = { status: "applied", insertedBlockCount: 8, replacedBlockCount: 6 };
  const supabase = {
    rpc: async (...args: unknown[]) => {
      calls.push(args);
      return { data: expected, error: null };
    },
  } as unknown as ApplicationClient;

  expect(await applyScheduleTemplateWeek({ ...input, supabase, replaceExisting: true })).toEqual(expected);
  expect(calls).toEqual([["apply_schedule_template_week", {
    target_organization_id: input.organizationId,
    target_template_id: input.templateId,
    target_week_start: "2026-10-05",
    target_replace_existing: true,
  }]]);
});

for (const [code, status] of [
  ["23P01", "coach-unavailable"],
  ["23514", "coach-missing-certification"],
  ["42501", "save-failed"],
  ["23503", "save-failed"],
] as const) {
  test(`failed atomic application ${code} reports no committed changes`, async () => {
    const supabase = {
      rpc: async () => ({ data: null, error: { code } }),
    } as unknown as ApplicationClient;
    expect(await applyScheduleTemplateWeek({ ...input, supabase })).toEqual({
      status, insertedBlockCount: 0, replacedBlockCount: 0,
    });
  });
}

test("unexpected RPC payload cannot be mistaken for a successful application", async () => {
  for (const data of [null, [], { status: "applied" },
    { status: "applied", insertedBlockCount: -1, replacedBlockCount: 0 }]) {
    const supabase = {
      rpc: async () => ({ data, error: null }),
    } as unknown as ApplicationClient;
    expect(await applyScheduleTemplateWeek({ ...input, supabase })).toEqual({
      status: "save-failed", insertedBlockCount: 0, replacedBlockCount: 0,
    });
  }
});
