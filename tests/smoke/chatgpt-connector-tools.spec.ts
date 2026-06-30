import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildChatGptConnectorScheduleTemplateApplicationPlan,
  buildChatGptConnectorScheduleTemplateApplicationPlanSnapshot,
  buildChatGptConnectorScheduleTemplateDraftBlocks,
  buildChatGptConnectorScheduleTemplatePreview,
  buildChatGptConnectorScheduleBlockSummaries,
  createChatGptConnectorConfirmationToken,
  filterChatGptConnectorScheduleBlocksAtTime,
  getChatGptConnectorAccessError,
  getChatGptConnectorSensitiveScopeViolation,
  normalizeChatGptConnectorDateRange,
  normalizeChatGptConnectorTime,
  parseChatGptConnectorConfirmationToken,
  resolveChatGptConnectorCenterReference,
  resolveChatGptConnectorClassTypeReference,
  resolveChatGptConnectorOwnCoach,
  type ChatGptConnectorAssignmentRow,
  type ChatGptConnectorCenterRow,
  type ChatGptConnectorClassTypeRow,
  type ChatGptConnectorCoachProfileRow,
  type ChatGptConnectorPersonProfileRow,
  type ChatGptConnectorScheduleTemplateApplicationBlock,
  type ChatGptConnectorScheduleTemplateApplicationTemplate,
  type ChatGptConnectorScheduleTemplatePreviewRuleInput,
  type ChatGptConnectorScheduleBlockRow,
} from "../../src/lib/chatgpt-connector-core";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function getTsFunctionSource(source: string, functionName: string) {
  const start = source.indexOf(`export async function ${functionName}`);

  if (start === -1) {
    return "";
  }

  const nextExport = source.indexOf("\nexport async function", start + 1);

  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

const centerOne: ChatGptConnectorCenterRow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Box City Norte",
  status: "active",
  timezone: "Europe/Madrid",
};

const centerTwo: ChatGptConnectorCenterRow = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Box City Sur",
  status: "active",
  timezone: "Europe/Madrid",
};

const classType: ChatGptConnectorClassTypeRow = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Cross Training",
  required_coaches: 1,
  status: "active",
};

const coachProfile: ChatGptConnectorCoachProfileRow = {
  id: "44444444-4444-4444-8444-444444444444",
  person_profile_id: "55555555-5555-4555-8555-555555555555",
  status: "active",
  user_id: null,
};

const personProfile: ChatGptConnectorPersonProfileRow = {
  display_name: "Ana Garcia",
  id: "55555555-5555-4555-8555-555555555555",
  status: "active",
  user_id: null,
  visibility_status: "visible",
};

const firstBlock: ChatGptConnectorScheduleBlockRow = {
  center_id: centerOne.id,
  class_type_id: classType.id,
  end_time: "10:00:00",
  id: "66666666-6666-4666-8666-666666666666",
  required_coaches: 1,
  service_date: "2026-07-07",
  start_time: "09:00:00",
  status: "scheduled",
};

const secondBlock: ChatGptConnectorScheduleBlockRow = {
  center_id: centerTwo.id,
  class_type_id: classType.id,
  end_time: "11:00:00",
  id: "77777777-7777-4777-8777-777777777777",
  required_coaches: 1,
  service_date: "2026-07-07",
  start_time: "10:00:00",
  status: "scheduled",
};

const assignment: ChatGptConnectorAssignmentRow = {
  assignment_status: "assigned",
  coach_profile_id: coachProfile.id,
  id: "88888888-8888-4888-8888-888888888888",
  schedule_block_id: firstBlock.id,
};

const draftTemplate: ChatGptConnectorScheduleTemplateApplicationTemplate = {
  center_id: centerOne.id,
  id: "99999999-9999-4999-8999-999999999999",
  name: "Plantilla Julio Box City",
  status: "draft",
  template_type: "weekly",
  valid_from: "2026-07-01",
  valid_until: "2026-07-31",
};

const templateBlock: ChatGptConnectorScheduleTemplateApplicationBlock = {
  center_id: centerOne.id,
  class_type_id: classType.id,
  day_of_week: 1,
  default_coach_profile_id: coachProfile.id,
  end_time: "10:00:00",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  required_coaches: 1,
  start_time: "09:00:00",
};

test.describe("ChatGPT connector read-only tools core", () => {
  test("builds minimized schedule-for-day JSON with visible coach and coverage", () => {
    const summaries = buildChatGptConnectorScheduleBlockSummaries({
      assignments: [assignment],
      blocks: [firstBlock],
      centers: [centerOne],
      classTypes: [classType],
      coachProfiles: [coachProfile],
      memberships: [],
      personProfiles: [personProfile],
    });

    expect(summaries).toEqual([
      {
        center_id: centerOne.id,
        center_name: "Box City Norte",
        class_type_id: classType.id,
        class_type_name: "Cross Training",
        coaches: [
          {
            assignment_status: "assigned",
            coach_id: coachProfile.id,
            display_name: "Ana Garcia",
          },
        ],
        coverage_status: "covered",
        ends_at: "10:00",
        schedule_block_id: firstBlock.id,
        starts_at: "09:00",
        status: "scheduled",
      },
    ]);
  });

  test("filters who is teaching at a specific time", () => {
    expect(
      filterChatGptConnectorScheduleBlocksAtTime({
        blocks: [firstBlock, secondBlock],
        matchMode: "overlapping",
        time: "09:15",
      }).map((block) => block.id),
    ).toEqual([firstBlock.id]);

    expect(
      filterChatGptConnectorScheduleBlocksAtTime({
        blocks: [firstBlock, secondBlock],
        matchMode: "starting_at",
        time: "10:00",
      }).map((block) => block.id),
    ).toEqual([secondBlock.id]);
  });

  test("normalizes access denials for auth, tenant and capability checks", () => {
    expect(
      getChatGptConnectorAccessError({
        authenticated: false,
      }),
    ).toBe("authentication_required");
    expect(
      getChatGptConnectorAccessError({
        authenticated: true,
        resolutionOk: false,
        resolutionReason: "organization_required",
      }),
    ).toBe("organization_required");
    expect(
      getChatGptConnectorAccessError({
        authenticated: true,
        resolutionOk: false,
        resolutionReason: "organization_not_found",
      }),
    ).toBe("permission_denied");
    expect(
      getChatGptConnectorAccessError({
        accessMode: "platform_support",
        authenticated: true,
        requirePersonalAccess: true,
        resolutionOk: true,
        role: "platform_support",
      }),
    ).toBe("permission_denied");
    expect(
      getChatGptConnectorAccessError({
        accessMode: "membership",
        authenticated: true,
        requireOperationalManagement: true,
        resolutionOk: true,
        role: "coach",
      }),
    ).toBe("permission_denied");
    expect(
      getChatGptConnectorAccessError({
        accessMode: "membership",
        authenticated: true,
        requireOperationalManagement: true,
        resolutionOk: true,
        role: "manager",
      }),
    ).toBeNull();
  });

  test("returns center ambiguous or not found without leaking other tenant data", () => {
    const ambiguous = resolveChatGptConnectorCenterReference({
      center_name: "Box City",
      centers: [centerOne, centerTwo],
    });
    const missing = resolveChatGptConnectorCenterReference({
      center_id: "99999999-9999-4999-8999-999999999999",
      centers: [centerOne],
    });

    expect(ambiguous).toMatchObject({
      code: "center_ambiguous",
      ok: false,
    });
    expect(ambiguous.ok ? [] : ambiguous.details.candidates).toEqual([
      { center_id: centerOne.id, name: centerOne.name },
      { center_id: centerTwo.id, name: centerTwo.name },
    ]);
    expect(missing).toMatchObject({
      code: "center_not_found",
      ok: false,
    });
  });

  test("returns class type not found for invalid or ambiguous activity filters", () => {
    expect(
      resolveChatGptConnectorClassTypeReference({
        class_type_id: "not-a-uuid",
        classTypes: [classType],
      }),
    ).toMatchObject({
      code: "class_type_not_found",
      ok: false,
    });
    expect(
      resolveChatGptConnectorClassTypeReference({
        class_type_name: "cross",
        classTypes: [
          classType,
          {
            ...classType,
            id: "99999999-9999-4999-8999-999999999999",
            name: "Cross Endurance",
          },
        ],
      }),
    ).toMatchObject({
      code: "class_type_not_found",
      details: {
        reason: "ambiguous_match",
      },
      ok: false,
    });
  });

  test("rejects invalid date ranges and invalid times", () => {
    expect(
      normalizeChatGptConnectorDateRange({
        dateFrom: "2026-07-10",
        dateTo: "2026-07-07",
      }),
    ).toMatchObject({
      code: "invalid_date_range",
      details: { reason: "inverted_range" },
      ok: false,
    });
    expect(
      normalizeChatGptConnectorDateRange({
        dateFrom: "2026-07-01",
        dateTo: "2026-08-31",
      }),
    ).toMatchObject({
      code: "invalid_date_range",
      details: { reason: "range_too_large" },
      ok: false,
    });
    expect(normalizeChatGptConnectorTime("24:00")).toBeNull();
  });

  test("blocks sensitive scopes before operational reads", () => {
    expect(
      getChatGptConnectorSensitiveScopeViolation({
        include_documents: true,
      }),
    ).toBe("sensitive-flag");
    expect(
      getChatGptConnectorSensitiveScopeViolation({
        requested_scope: "payroll email phone",
      }),
    ).toBe("payroll email phone");
  });

  test("keeps normalized CG.3 confirmation and template errors available", () => {
    const source = readProjectFile("src/lib/chatgpt-connector-core.ts");

    expect(source).toContain('"confirmation_required"');
    expect(source).toContain('"confirmation_mismatch"');
    expect(source).toContain('"template_not_found"');
    expect(source).toContain('"template_not_applicable"');
    expect(source).toContain('"idempotency_conflict"');
  });

  test("resolves get_my_schedule only for a unique active visible person and coach", () => {
    const ownUserId = "99999999-9999-4999-8999-999999999999";
    const ownPerson = {
      ...personProfile,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: ownUserId,
    };
    const ownCoach = {
      ...coachProfile,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      person_profile_id: ownPerson.id,
      user_id: ownUserId,
    };

    expect(
      resolveChatGptConnectorOwnCoach({
        coachProfiles: [ownCoach],
        personProfiles: [ownPerson],
        userId: ownUserId,
      }),
    ).toMatchObject({
      coach_profile_id: ownCoach.id,
      display_name: ownPerson.display_name,
      ok: true,
      person_profile_id: ownPerson.id,
    });
    expect(
      resolveChatGptConnectorOwnCoach({
        coachProfiles: [
          ownCoach,
          {
            ...ownCoach,
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          },
        ],
        personProfiles: [ownPerson],
        userId: ownUserId,
      }),
    ).toMatchObject({
      ok: false,
      reason: "ambiguous_coach_profile",
    });
  });

  test("previews a simple schedule template without persisting draft data", () => {
    const rules: ChatGptConnectorScheduleTemplatePreviewRuleInput[] = [
      {
        class_type_id: classType.id,
        coach_ids: [],
        ends_at: "11:00",
        slot_duration_minutes: 60,
        starts_at: "09:00",
        weekdays: ["monday"],
      },
    ];
    const preview = buildChatGptConnectorScheduleTemplatePreview({
      center: centerOne,
      classTypes: [classType],
      coachSummaries: [],
      dateFrom: "2026-07-06",
      dateTo: "2026-07-06",
      name: "Plantilla Julio Box City",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rules,
    });
    const repeatedPreview = buildChatGptConnectorScheduleTemplatePreview({
      center: centerOne,
      classTypes: [classType],
      coachSummaries: [],
      dateFrom: "2026-07-06",
      dateTo: "2026-07-06",
      name: "Plantilla Julio Box City",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rules,
    });

    expect(preview).toMatchObject({
      ok: true,
      preview: {
        summary: {
          center_id: centerOne.id,
          center_name: centerOne.name,
          date_from: "2026-07-06",
          date_to: "2026-07-06",
          range_days: 1,
          total_blocks: 2,
          warnings_count: 0,
        },
        warnings: [],
      },
    });
    expect(preview.ok ? preview.preview.preview_id : "").toMatch(/^prev_/);
    expect(preview.ok ? preview.preview.preview_id : "").toBe(
      repeatedPreview.ok ? repeatedPreview.preview.preview_id : "",
    );
    expect(preview.ok ? preview.preview.sample_blocks : []).toEqual([
      {
        center_id: centerOne.id,
        center_name: centerOne.name,
        class_type_id: classType.id,
        class_type_name: classType.name,
        coach_names: [],
        date: "2026-07-06",
        ends_at: "10:00",
        starts_at: "09:00",
      },
      {
        center_id: centerOne.id,
        center_name: centerOne.name,
        class_type_id: classType.id,
        class_type_name: classType.name,
        coach_names: [],
        date: "2026-07-06",
        ends_at: "11:00",
        starts_at: "10:00",
      },
    ]);
    expect(JSON.stringify(preview)).not.toMatch(
      /email|phone|telefono|document|payroll|storage|notes/i,
    );
  });

  test("builds draft template blocks from a matching deterministic preview", () => {
    const rules: ChatGptConnectorScheduleTemplatePreviewRuleInput[] = [
      {
        class_type_id: classType.id,
        coach_ids: [coachProfile.id],
        ends_at: "11:00",
        slot_duration_minutes: 60,
        starts_at: "09:00",
        weekdays: ["monday"],
      },
    ];
    const preview = buildChatGptConnectorScheduleTemplatePreview({
      center: centerOne,
      classTypes: [classType],
      coachSummaries: [
        {
          coach_id: coachProfile.id,
          display_name: personProfile.display_name,
        },
      ],
      dateFrom: "2026-07-06",
      dateTo: "2026-07-06",
      name: "Plantilla Julio Box City",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rules,
    });
    const mismatchedPreview = buildChatGptConnectorScheduleTemplatePreview({
      center: centerOne,
      classTypes: [classType],
      coachSummaries: [
        {
          coach_id: coachProfile.id,
          display_name: personProfile.display_name,
        },
      ],
      dateFrom: "2026-07-06",
      dateTo: "2026-07-06",
      name: "Plantilla Julio Box City modificada",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rules,
    });
    const draftBlocks = buildChatGptConnectorScheduleTemplateDraftBlocks({
      center: centerOne,
      classTypes: [classType],
      rules,
    });

    expect(preview.ok ? preview.preview.preview_id : "").toMatch(/^prev_/);
    expect(preview.ok ? preview.preview.preview_id : "").not.toBe(
      mismatchedPreview.ok ? mismatchedPreview.preview.preview_id : "",
    );
    expect(draftBlocks).toMatchObject({
      ok: true,
      warnings: [],
    });
    expect(draftBlocks.ok ? draftBlocks.blocks : []).toEqual([
      {
        center_id: centerOne.id,
        class_type_id: classType.id,
        day_of_week: 1,
        default_coach_profile_id: coachProfile.id,
        end_time: "10:00",
        metadata: {
          rule_index: 1,
          source: "chatgpt_connector",
        },
        required_coaches: classType.required_coaches,
        start_time: "09:00",
      },
      {
        center_id: centerOne.id,
        class_type_id: classType.id,
        day_of_week: 1,
        default_coach_profile_id: coachProfile.id,
        end_time: "11:00",
        metadata: {
          rule_index: 1,
          source: "chatgpt_connector",
        },
        required_coaches: classType.required_coaches,
        start_time: "10:00",
      },
    ]);
    expect(JSON.stringify(draftBlocks)).not.toMatch(
      /email|phone|telefono|document|payroll|storage|notes/i,
    );
  });

  test("rejects invalid or too-large schedule template previews", () => {
    expect(
      normalizeChatGptConnectorDateRange({
        dateFrom: "2026-07-01",
        dateTo: "2026-09-15",
        maxDays: 62,
      }),
    ).toMatchObject({
      code: "invalid_date_range",
      details: { max_days: 62, reason: "range_too_large" },
      ok: false,
    });

    expect(
      buildChatGptConnectorScheduleTemplatePreview({
        center: centerOne,
        classTypes: [classType],
        coachSummaries: [],
        dateFrom: "2026-07-06",
        dateTo: "2026-07-06",
        maxBlocks: 1,
        name: "Too large",
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        rules: [
          {
            class_type_id: classType.id,
            ends_at: "11:00",
            slot_duration_minutes: 60,
            starts_at: "09:00",
            weekdays: ["monday"],
          },
        ],
      }),
    ).toMatchObject({
      code: "invalid_date_range",
      details: { max_blocks: 1, reason: "preview_too_large" },
      ok: false,
    });

    expect(
      buildChatGptConnectorScheduleTemplatePreview({
        center: centerOne,
        classTypes: [classType],
        coachSummaries: [],
        dateFrom: "2026-07-06",
        dateTo: "2026-07-06",
        name: "Invalid time",
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        rules: [
          {
            class_type_id: classType.id,
            ends_at: "09:00",
            slot_duration_minutes: 60,
            starts_at: "10:00",
            weekdays: ["monday"],
          },
        ],
      }),
    ).toMatchObject({
      code: "invalid_time_range",
      ok: false,
    });
  });

  test("rejects preview references to missing center, class type or coach", () => {
    expect(
      resolveChatGptConnectorCenterReference({
        center_id: "99999999-9999-4999-8999-999999999999",
        centers: [centerOne],
      }),
    ).toMatchObject({
      code: "center_not_found",
      ok: false,
    });
    expect(
      buildChatGptConnectorScheduleTemplatePreview({
        center: centerOne,
        classTypes: [classType],
        coachSummaries: [],
        dateFrom: "2026-07-06",
        dateTo: "2026-07-06",
        name: "Missing class type",
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        rules: [
          {
            class_type_id: "99999999-9999-4999-8999-999999999999",
            ends_at: "10:00",
            slot_duration_minutes: 60,
            starts_at: "09:00",
            weekdays: ["monday"],
          },
        ],
      }),
    ).toMatchObject({
      code: "class_type_not_found",
      ok: false,
    });
    expect(
      buildChatGptConnectorScheduleTemplatePreview({
        center: centerOne,
        classTypes: [classType],
        coachSummaries: [],
        dateFrom: "2026-07-06",
        dateTo: "2026-07-06",
        name: "Missing coach",
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        rules: [
          {
            class_type_id: classType.id,
            coach_ids: [coachProfile.id],
            ends_at: "10:00",
            slot_duration_minutes: 60,
            starts_at: "09:00",
            weekdays: ["monday"],
          },
        ],
      }),
    ).toMatchObject({
      code: "coach_not_found",
      details: { coach_ids: [coachProfile.id] },
      ok: false,
    });
  });

  test("warns about coach conflicts in preview and existing schedule", () => {
    const preview = buildChatGptConnectorScheduleTemplatePreview({
      center: centerOne,
      classTypes: [classType],
      coachSummaries: [
        {
          coach_id: coachProfile.id,
          display_name: personProfile.display_name,
        },
      ],
      dateFrom: "2026-07-06",
      dateTo: "2026-07-06",
      existingAssignments: [assignment],
      existingBlocks: [
        {
          ...firstBlock,
          service_date: "2026-07-06",
          start_time: "09:30:00",
          end_time: "10:30:00",
        },
      ],
      name: "Conflicts",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rules: [
        {
          class_type_id: classType.id,
          coach_ids: [coachProfile.id],
          ends_at: "10:00",
          slot_duration_minutes: 60,
          starts_at: "09:00",
          weekdays: ["monday"],
        },
        {
          class_type_id: classType.id,
          coach_ids: [coachProfile.id],
          ends_at: "10:30",
          slot_duration_minutes: 60,
          starts_at: "09:30",
          weekdays: ["monday"],
        },
      ],
    });

    expect(preview.ok ? preview.preview.warnings : []).toEqual(
      expect.arrayContaining([
        `coach_overlap_in_preview:${coachProfile.id}:2026-07-06`,
        `coach_existing_schedule_conflict:${coachProfile.id}:2026-07-06`,
      ]),
    );
  });

  test("prepares a verifiable application summary from an existing draft template", () => {
    const plan = buildChatGptConnectorScheduleTemplateApplicationPlan({
      activeCoachCertificationKeys: [],
      center: centerOne,
      classTypes: [classType],
      coachSummaries: [
        {
          coach_id: coachProfile.id,
          display_name: personProfile.display_name,
        },
      ],
      dateFrom: "2026-07-06",
      dateTo: "2026-07-06",
      template: draftTemplate,
      templateBlocks: [templateBlock],
    });

    expect(plan).toMatchObject({
      ok: true,
      plan: {
        duplicate_blocks: [],
        summary: {
          blocks_to_create: 1,
          center_id: centerOne.id,
          conflict_count: 0,
          date_from: "2026-07-06",
          date_to: "2026-07-06",
          duplicate_count: 0,
          estimated_assignments_to_create: 1,
          range_days: 1,
          template_id: draftTemplate.id,
          template_status: "draft",
          total_candidate_blocks: 1,
        },
      },
    });
    expect(plan.ok ? plan.plan.plan_hash : "").toBeTruthy();
    expect(plan.ok ? plan.plan.candidate_blocks : []).toEqual([
      {
        center_id: centerOne.id,
        center_name: centerOne.name,
        class_type_id: classType.id,
        class_type_name: classType.name,
        date: "2026-07-06",
        default_coach_id: coachProfile.id,
        default_coach_name: personProfile.display_name,
        duplicate_of_schedule_block_id: null,
        ends_at: "10:00",
        required_coaches: 1,
        starts_at: "09:00",
        template_block_id: templateBlock.id,
        will_create: true,
      },
    ]);
  });

  test("reports predictable duplicates and relevant conflicts without mutating schedule data", () => {
    const existingDuplicate: ChatGptConnectorScheduleBlockRow = {
      ...firstBlock,
      service_date: "2026-07-06",
      template_block_id: templateBlock.id,
      template_id: draftTemplate.id,
    };
    const existingCoachConflict: ChatGptConnectorScheduleBlockRow = {
      ...secondBlock,
      center_id: centerOne.id,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      service_date: "2026-07-13",
      start_time: "09:30:00",
      end_time: "10:30:00",
    };
    const conflictAssignment: ChatGptConnectorAssignmentRow = {
      ...assignment,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      schedule_block_id: existingCoachConflict.id,
    };
    const plan = buildChatGptConnectorScheduleTemplateApplicationPlan({
      center: centerOne,
      classTypes: [classType],
      coachSummaries: [
        {
          coach_id: coachProfile.id,
          display_name: personProfile.display_name,
        },
      ],
      dateFrom: "2026-07-06",
      dateTo: "2026-07-13",
      existingAssignments: [conflictAssignment],
      existingBlocks: [existingDuplicate, existingCoachConflict],
      template: draftTemplate,
      templateBlocks: [templateBlock],
    });

    expect(plan.ok ? plan.plan.summary : {}).toMatchObject({
      blocks_to_create: 1,
      conflict_count: 2,
      duplicate_count: 1,
      total_candidate_blocks: 2,
    });
    expect(plan.ok ? plan.plan.duplicate_blocks : []).toEqual([
      {
        date: "2026-07-06",
        duplicate_of_schedule_block_id: existingDuplicate.id,
        ends_at: "10:00",
        reason: "same_template_block_date",
        starts_at: "09:00",
        template_block_id: templateBlock.id,
      },
    ]);
    expect(plan.ok ? plan.plan.conflicts.map((conflict) => conflict.code) : []).toEqual(
      expect.arrayContaining([
        "center_time_overlap",
        "coach_existing_schedule_conflict",
      ]),
    );
    expect(JSON.stringify(plan)).not.toMatch(
      /email|phone|telefono|document|payroll|storage|notes/i,
    );
  });

  test("rejects inapplicable templates, invalid ranges and foreign centers", () => {
    expect(
      normalizeChatGptConnectorDateRange({
        dateFrom: "2026-07-15",
        dateTo: "2026-07-01",
        maxDays: 62,
      }),
    ).toMatchObject({
      code: "invalid_date_range",
      details: { reason: "inverted_range" },
      ok: false,
    });
    expect(
      buildChatGptConnectorScheduleTemplateApplicationPlan({
        center: centerTwo,
        classTypes: [classType],
        coachSummaries: [],
        dateFrom: "2026-07-06",
        dateTo: "2026-07-06",
        template: draftTemplate,
        templateBlocks: [templateBlock],
      }),
    ).toMatchObject({
      code: "template_not_applicable",
      details: { reason: "template_center_mismatch" },
      ok: false,
    });
    expect(
      buildChatGptConnectorScheduleTemplateApplicationPlan({
        center: centerOne,
        classTypes: [classType],
        coachSummaries: [],
        dateFrom: "2026-07-06",
        dateTo: "2026-07-06",
        template: {
          ...draftTemplate,
          status: "archived",
        },
        templateBlocks: [templateBlock],
      }),
    ).toMatchObject({
      code: "template_not_applicable",
      details: { reason: "template_status_not_allowed" },
      ok: false,
    });
  });

  test("creates parseable confirmation tokens and minimized application snapshots", () => {
    const plan = buildChatGptConnectorScheduleTemplateApplicationPlan({
      center: centerOne,
      classTypes: [classType],
      coachSummaries: [
        {
          coach_id: coachProfile.id,
          display_name: personProfile.display_name,
        },
      ],
      dateFrom: "2026-07-06",
      dateTo: "2026-07-06",
      template: draftTemplate,
      templateBlocks: [templateBlock],
    });
    const token = createChatGptConnectorConfirmationToken({
      confirmationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      tokenSecret: "abcdefghijklmnopqrstuvwxyzABCDEF0123456789-_",
    });

    expect(token).toMatch(
      /^confirm_v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{32,128}$/,
    );
    expect(parseChatGptConnectorConfirmationToken(token)).toMatchObject({
      confirmation_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      ok: true,
    });
    expect(parseChatGptConnectorConfirmationToken("confirm_bad")).toMatchObject({
      ok: false,
      reason: "invalid_format",
    });

    const snapshot = plan.ok
      ? buildChatGptConnectorScheduleTemplateApplicationPlanSnapshot(plan.plan)
      : null;

    expect(snapshot).toMatchObject({
      candidate_blocks: [
        {
          center_id: centerOne.id,
          class_type_id: classType.id,
          date: "2026-07-06",
          default_coach_id: coachProfile.id,
          ends_at: "10:00",
          required_coaches: 1,
          starts_at: "09:00",
          template_block_id: templateBlock.id,
          will_create: true,
        },
      ],
      summary: {
        blocks_to_create: 1,
        conflict_count: 0,
        skipped_duplicate_count: 0,
        template_id: draftTemplate.id,
        total_candidate_blocks: 1,
      },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/center_name|class_type_name|default_coach_name/i);
  });

  test("keeps connector tools tenant-scoped and limits CG.2B/CG.3 mutations", () => {
    const source = readProjectFile("src/lib/chatgpt-connector-tools.ts");
    const previewSource = getTsFunctionSource(source, "previewScheduleTemplate");
    const createDraftSource = getTsFunctionSource(
      source,
      "createScheduleTemplateDraft",
    );
    const prepareApplicationSource = getTsFunctionSource(
      source,
      "prepareScheduleTemplateApplication",
    );
    const applyApplicationSource = getTsFunctionSource(
      source,
      "applyScheduleTemplate",
    );
    const sourceWithoutAllowedMutations = source
      .replace(createDraftSource, "")
      .replace(prepareApplicationSource, "")
      .replace(applyApplicationSource, "");

    expect(source).toContain("getAuthenticatedUser");
    expect(source).toContain("getActiveMemberships");
    expect(source).toContain("resolveActiveOrganization");
    expect(source).toContain("getChatGptConnectorAccessError");
    expect(source).toContain('.eq("organization_id"');
    expect(source).toContain("preview_schedule_template");
    expect(source).toContain("create_schedule_template_draft");
    expect(source).toContain("prepare_schedule_template_application");
    expect(source).toContain("apply_schedule_template");
    expect(previewSource).toContain("requireOperationalManagement: true");
    expect(createDraftSource).toContain("requireOperationalManagement: true");
    expect(prepareApplicationSource).toContain("requireOperationalManagement: true");
    expect(applyApplicationSource).toContain("requireOperationalManagement: true");
    expect(createDraftSource).toContain("buildChatGptConnectorScheduleTemplatePreview");
    expect(createDraftSource).toContain("preview_id_mismatch");
    expect(createDraftSource).toContain("loadExistingDraftByIdempotencyKey");
    expect(createDraftSource).toContain("idempotent_replay");
    expect(createDraftSource).toContain("idempotency_conflict");
    expect(prepareApplicationSource).toContain(
      "buildChatGptConnectorScheduleTemplateApplicationPlan",
    );
    expect(prepareApplicationSource).toContain(
      "createChatGptConnectorConfirmationToken",
    );
    expect(prepareApplicationSource).toContain(
      "buildChatGptConnectorScheduleTemplateApplicationPlanSnapshot",
    );
    expect(prepareApplicationSource).toContain("template_not_found");
    expect(prepareApplicationSource).toContain("template_not_applicable");
    expect(prepareApplicationSource).toContain("idempotency_conflict");
    expect(prepareApplicationSource).toMatch(
      /\.from\("chatgpt_connector_confirmations"\)[\s\S]{0,500}\.insert\(/,
    );
    expect(prepareApplicationSource).not.toMatch(
      /\.from\("schedule_blocks"\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(prepareApplicationSource).not.toMatch(
      /\.from\("schedule_block_assignments"\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(prepareApplicationSource).not.toMatch(
      /\.storage\b|document_versions|time_records|payroll|service_role|SUPABASE_SERVICE_ROLE/i,
    );
    expect(applyApplicationSource).toContain("parseChatGptConnectorConfirmationToken");
    expect(applyApplicationSource).toContain("loadConnectorConfirmation");
    expect(applyApplicationSource).toContain(
      "apply_chatgpt_schedule_template_application",
    );
    expect(applyApplicationSource).toContain("confirmation_expired");
    expect(applyApplicationSource).toContain("plan_hash_mismatch");
    expect(applyApplicationSource).toContain("application_conflicts_found");
    expect(applyApplicationSource).not.toMatch(
      /\.from\("schedule_blocks"\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(applyApplicationSource).not.toMatch(
      /\.from\("schedule_block_assignments"\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(sourceWithoutAllowedMutations).not.toMatch(
      /\.from\(["'][^"']+["']\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(previewSource).not.toMatch(/\.(?:insert|update|upsert|delete)\(/);
    expect(previewSource).not.toMatch(
      /schedule_templates|schedule_template_blocks|service_role|SUPABASE_SERVICE_ROLE|\.storage\b/i,
    );
    expect(createDraftSource).toMatch(
      /\.from\("schedule_templates"\)[\s\S]{0,500}\.insert\(/,
    );
    expect(createDraftSource).toMatch(
      /\.from\("schedule_template_blocks"\)[\s\S]{0,500}\.insert\(/,
    );
    expect(createDraftSource).toMatch(
      /\.from\("schedule_templates"\)[\s\S]{0,500}\.delete\(/,
    );
    expect(createDraftSource).not.toMatch(
      /\.from\("schedule_blocks"\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(createDraftSource).not.toMatch(
      /\.from\("schedule_block_assignments"\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(createDraftSource).not.toMatch(/\.storage\b|document_versions|time_records|payroll/i);
    expect(source).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/i);
    expect(source).not.toMatch(/\.storage\b|document_versions|time_records|payroll/i);
  });

  test("defines CG.3B transactional confirmation, idempotency and audit guardrails", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260630083015_chatgpt_connector_apply_schedule_template.sql",
    );

    expect(migration).toContain("CREATE TABLE public.chatgpt_connector_confirmations");
    expect(migration).toContain("token_hash text NOT NULL UNIQUE");
    expect(migration).toContain("plan_snapshot jsonb NOT NULL");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.apply_chatgpt_schedule_template_application");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("LOCK TABLE public.schedule_blocks");
    expect(migration).toContain("LOCK TABLE public.schedule_block_assignments");
    expect(migration).toContain("INSERT INTO public.schedule_blocks");
    expect(migration).toContain("INSERT INTO public.schedule_block_assignments");
    expect(migration).toContain("public.record_operational_audit_event");
    expect(migration).toContain("'source', 'chatgpt_connector'");
    expect(migration).toContain("'tool', 'apply_schedule_template'");
    expect(migration).toContain("'idempotent_replay', true");
    expect(migration).toContain("'idempotency_conflict'");
    expect(migration).toContain("'confirmation_expired'");
    expect(migration).toContain("'application_conflicts_found'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.apply_chatgpt_schedule_template_application");
    expect(migration).not.toMatch(
      /service_role|SUPABASE_SERVICE_ROLE|\.storage\b|document_versions|time_records|payroll|signature|geolocation|gps|location_events/i,
    );
  });
});
