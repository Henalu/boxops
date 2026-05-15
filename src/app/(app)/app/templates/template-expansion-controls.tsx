"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";

export function TemplateExpansionControls({
  templateCount,
}: {
  templateCount: number;
}) {
  function setTemplatesOpen(open: boolean) {
    document
      .querySelectorAll<HTMLDetailsElement>("[data-template-details]")
      .forEach((details) => {
        details.open = open;
      });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={templateCount === 0}
        onClick={() => setTemplatesOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <ChevronDown aria-hidden="true" />
        Expandir todas
      </Button>
      <Button
        disabled={templateCount === 0}
        onClick={() => setTemplatesOpen(false)}
        size="sm"
        type="button"
        variant="outline"
      >
        <ChevronUp aria-hidden="true" />
        Contraer todas
      </Button>
    </div>
  );
}
