import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test.describe("navigation role visibility", () => {
  test("keeps coverage navigation for operational managers, not coaches", () => {
    const appNavigation = readProjectFile(
      "src/components/layout/app-navigation.tsx",
    );
    const onboardingTour = readProjectFile(
      "src/components/layout/onboarding-tour.tsx",
    );
    const appLayout = readProjectFile("src/app/(app)/app/layout.tsx");

    expect(appNavigation).toContain("visibleMainItems");
    expect(appNavigation).toContain('item.href === "/app/coverage"');
    expect(appNavigation).toContain("return canManageOperational");
    expect(appNavigation).toContain("visibleMainItems.length === 4");

    expect(onboardingTour).toContain("canManageOperationalData");
    expect(onboardingTour).toContain('candidate.id !== "coverage"');
    expect(onboardingTour).toContain('candidate.id !== "coverage-risks"');
    expect(appLayout).toContain(
      "<OnboardingTour memberships={navigationMemberships} />",
    );
  });
});
