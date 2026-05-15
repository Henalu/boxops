import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  calculateScheduleCoverageByBlock,
  isScheduleCoverageRisk,
} from "../../src/lib/schedule-blocks";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function expectDefaultCoachDetailGuarded(source: string) {
  const renderedDetailOccurrences = [...source.matchAll(/\{defaultCoachDetail\}/g)];

  expect(renderedDetailOccurrences.length).toBeGreaterThan(0);

  for (const occurrence of renderedDetailOccurrences) {
    const context = source.slice(
      Math.max(0, (occurrence.index ?? 0) - 260),
      occurrence.index,
    );

    expect(context).toContain("requiresCoach ?");
  }
}

test.describe("schedule zero-required coverage", () => {
  test("does not treat blocks with zero required coaches as vacancies or risks", () => {
    const coverageByBlock = calculateScheduleCoverageByBlock({
      absenceImpacts: [
        {
          impact_status: "coverage_needed",
          schedule_block_assignment_id: "assignment-zero",
          schedule_block_id: "zero-required",
          subject_coach_profile_id: "coach-one",
        },
      ],
      assignments: [
        {
          assignment_status: "assigned",
          coach_profile_id: "coach-one",
          id: "assignment-zero",
          schedule_block_id: "zero-required",
        },
        {
          assignment_status: "pending",
          coach_profile_id: "coach-two",
          id: "pending-zero",
          schedule_block_id: "zero-required",
        },
        {
          assignment_status: "assigned",
          coach_profile_id: "coach-one",
          id: "assignment-covered",
          schedule_block_id: "covered",
        },
      ],
      blocks: [
        {
          end_time: "08:00",
          id: "zero-required",
          required_coaches: 0,
          service_date: "2026-05-15",
          start_time: "07:00",
          status: "scheduled",
        },
        {
          end_time: "08:00",
          id: "covered",
          required_coaches: 1,
          service_date: "2026-05-15",
          start_time: "07:00",
          status: "scheduled",
        },
      ],
      coaches: [
        {
          id: "coach-one",
          person_profile_id: "person-one",
          status: "active",
          user_id: null,
        },
        {
          id: "coach-two",
          person_profile_id: "person-two",
          status: "active",
          user_id: null,
        },
      ],
      memberships: [],
      persons: [
        {
          id: "person-one",
          status: "active",
          visibility_status: "visible",
        },
        {
          id: "person-two",
          status: "active",
          visibility_status: "visible",
        },
      ],
    });

    const zeroRequiredCoverage = coverageByBlock.get("zero-required");
    const coveredCoverage = coverageByBlock.get("covered");

    expect(zeroRequiredCoverage).toMatchObject({
      absenceImpact: {
        coverageNeededCount: 0,
        potentialCount: 0,
      },
      pendingAssignmentCount: 0,
      requiredCoaches: 0,
      state: "not_required",
      validAssignmentCount: 0,
    });
    expect(zeroRequiredCoverage).toBeDefined();
    expect(isScheduleCoverageRisk(zeroRequiredCoverage!)).toBe(false);

    expect(coveredCoverage).toMatchObject({
      conflictCoachProfileIds: [],
      state: "covered",
      validAssignmentCount: 1,
    });
  });

  test("keeps template copy explicit for blocks without coach requirement", () => {
    const templateHelpers = readProjectFile("src/lib/schedule-templates.ts");
    const templatePage = readProjectFile("src/app/(app)/app/templates/page.tsx");
    const templateEditor = readProjectFile(
      "src/app/(app)/app/templates/template-blocks-editor.tsx",
    );

    expect(templateHelpers).toContain("scheduleTemplateBlockRequiresCoach");
    expect(templateHelpers).toContain("Sin requisito");
    expect(templateHelpers).toContain("No requiere entrenador");
    expect(templatePage).toContain("No requiere entrenador");
    expect(templatePage).toContain("getScheduleTemplateDefaultCoachLabel");
    expect(templatePage).toContain("getScheduleTemplateDefaultCoachDetail");
    expectDefaultCoachDetailGuarded(templatePage);
    expect(templateEditor).toContain("No requiere entrenador");
    expect(templateEditor).toContain("getScheduleTemplateDefaultCoachLabel");
    expect(templateEditor).toContain("getScheduleTemplateDefaultCoachDetail");
    expectDefaultCoachDetailGuarded(templateEditor);
  });

  test("keeps template week cards readable and activity-colored", () => {
    const templatePage = readProjectFile("src/app/(app)/app/templates/page.tsx");
    const templateEditor = readProjectFile(
      "src/app/(app)/app/templates/template-blocks-editor.tsx",
    );

    for (const source of [templatePage, templateEditor]) {
      expect(source).toContain("getClassTypeCardStyle");
      expect(source).toContain("color-mix(in oklch");
      expect(source).toContain("borderLeftColor");
      expect(source).toContain("min-h-[9.25rem]");
      expect(source).toContain('className="min-w-0 break-words"');
    }
  });
});
