import { expect, test } from "@playwright/test";

import { getUnavailableScheduleCoachAssignments } from "../../src/lib/schedule-blocks";

const targetBlock = {
  end_time: "12:00",
  id: "target",
  required_coaches: 1,
  service_date: "2026-05-11",
  start_time: "11:00",
  status: "scheduled",
};

test.describe("schedule coach availability", () => {
  test("blocks coaches assigned to overlapping active blocks", () => {
    const unavailable = getUnavailableScheduleCoachAssignments({
      assignments: [
        {
          assignment_status: "assigned",
          coach_profile_id: "coach-overlap",
          id: "assignment-overlap",
          schedule_block_id: "overlap",
        },
        {
          assignment_status: "assigned",
          coach_profile_id: "coach-adjacent-before",
          id: "assignment-adjacent-before",
          schedule_block_id: "adjacent-before",
        },
        {
          assignment_status: "assigned",
          coach_profile_id: "coach-adjacent-after",
          id: "assignment-adjacent-after",
          schedule_block_id: "adjacent-after",
        },
        {
          assignment_status: "removed",
          coach_profile_id: "coach-removed",
          id: "assignment-removed",
          schedule_block_id: "removed-overlap",
        },
        {
          assignment_status: "assigned",
          coach_profile_id: "coach-cancelled",
          id: "assignment-cancelled",
          schedule_block_id: "cancelled-overlap",
        },
      ],
      blocks: [
        targetBlock,
        {
          end_time: "12:15",
          id: "overlap",
          required_coaches: 1,
          service_date: "2026-05-11",
          start_time: "11:15",
          status: "scheduled",
        },
        {
          end_time: "11:00",
          id: "adjacent-before",
          required_coaches: 1,
          service_date: "2026-05-11",
          start_time: "10:00",
          status: "scheduled",
        },
        {
          end_time: "13:00",
          id: "adjacent-after",
          required_coaches: 1,
          service_date: "2026-05-11",
          start_time: "12:00",
          status: "scheduled",
        },
        {
          end_time: "12:15",
          id: "removed-overlap",
          required_coaches: 1,
          service_date: "2026-05-11",
          start_time: "11:15",
          status: "scheduled",
        },
        {
          end_time: "12:15",
          id: "cancelled-overlap",
          required_coaches: 1,
          service_date: "2026-05-11",
          start_time: "11:15",
          status: "cancelled",
        },
      ],
      targetBlock,
    });

    expect(unavailable).toEqual([
      expect.objectContaining({
        coachProfileId: "coach-overlap",
        endTime: "12:15",
        scheduleBlockId: "overlap",
        startTime: "11:15",
      }),
    ]);
  });
});
