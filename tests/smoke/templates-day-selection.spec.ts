import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test.describe("template day selection source guardrails", () => {
  test("keeps day-level selection wired to visible template blocks", () => {
    const templateEditor = readProjectFile(
      "src/app/(app)/app/templates/template-blocks-editor.tsx",
    );

    expect(templateEditor).toContain("function DaySelectionCheckbox");
    expect(templateEditor).toContain(
      'aria-checked={indeterminate ? "mixed" : checked}',
    );
    expect(templateEditor).toContain(
      "checkboxRef.current.indeterminate = indeterminate",
    );
    expect(templateEditor).toContain("function toggleSelectedDay");
    expect(templateEditor).toContain("const shouldSelectAll = dayBlocks.some");
    expect(templateEditor).toContain("next.add(block.id)");
    expect(templateEditor).toContain("next.delete(block.id)");
    expect(templateEditor).toContain(
      "onToggleDaySelected={toggleSelectedDay}",
    );
    expect(templateEditor).toContain("selectionAction");
    expect(templateEditor).toContain("todos los bloques de");
  });

  test("keeps multi-block copy constrained to a destination day", () => {
    const templateEditor = readProjectFile(
      "src/app/(app)/app/templates/template-blocks-editor.tsx",
    );
    const templateActions = readProjectFile(
      "src/app/(app)/app/templates/actions.ts",
    );

    expect(templateEditor).toContain("copyScheduleTemplateBlocksBulk");
    expect(templateEditor).toContain("function TemplateBlocksBulkCopyForm");
    expect(templateEditor).toContain('name="targetDayOfWeek"');
    expect(templateEditor).toContain(
      "La copia múltiple solo cambia el día destino.",
    );
    expect(templateEditor).toContain("Solo se cambia el día");
    expect(templateEditor).toContain("selectedBlocks.length > 0");
    expect(templateEditor).toContain("selectedBlockForCopy ? (");
    expect(templateActions).toContain(
      "export async function copyScheduleTemplateBlocksBulk",
    );
    expect(templateActions).toContain("function getTemplateBlockIds");
    expect(templateActions).toContain("function getTargetTemplateDay");
    expect(templateActions).toContain("template-block-duplicate");
    expect(templateActions).toContain("coach-unavailable");
    expect(templateActions).toContain("ensureScheduleTemplateRangeApplied");
  });
});
