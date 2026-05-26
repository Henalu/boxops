"use client";

import * as React from "react";

import type {
  StaffWorkWindowCenterOption,
  StaffWorkWindowPersonOption,
} from "@/lib/staff-work-windows";

const selectClassName = [
  "h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
  "outline-none transition-colors focus-visible:border-ring",
  "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export function StaffWorkWindowPersonCenterSelects({
  activeCenters,
  defaultCenterId,
  defaultPersonProfileId,
  people,
  preferPersonCenterOnInitial = false,
}: {
  activeCenters: StaffWorkWindowCenterOption[];
  defaultCenterId?: string | null;
  defaultPersonProfileId?: string | null;
  people: StaffWorkWindowPersonOption[];
  preferPersonCenterOnInitial?: boolean;
}) {
  const activeCenterIds = React.useMemo(
    () => new Set(activeCenters.map((center) => center.id)),
    [activeCenters],
  );
  const getPrimaryCenterId = React.useCallback(
    (personProfileId: string) => {
      const primaryCenterId =
        people.find((person) => person.id === personProfileId)
          ?.primary_center_id ?? "";

      return activeCenterIds.has(primaryCenterId) ? primaryCenterId : "";
    },
    [activeCenterIds, people],
  );
  const initialPersonProfileId = defaultPersonProfileId ?? people[0]?.id ?? "";
  const hasInitialPersonOption = people.some(
    (person) => person.id === initialPersonProfileId,
  );
  const [personProfileId, setPersonProfileId] = React.useState(
    initialPersonProfileId,
  );
  const [centerId, setCenterId] = React.useState(() => {
    if (preferPersonCenterOnInitial) {
      return getPrimaryCenterId(initialPersonProfileId);
    }

    return defaultCenterId ?? "";
  });

  return (
    <>
      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Persona</span>
        <select
          className={selectClassName}
          name="personProfileId"
          onChange={(event) => {
            const nextPersonProfileId = event.currentTarget.value;
            setPersonProfileId(nextPersonProfileId);
            setCenterId(getPrimaryCenterId(nextPersonProfileId));
          }}
          required
          value={personProfileId}
        >
          {people.length === 0 ? <option value="">Sin fichas activas</option> : null}
          {initialPersonProfileId && !hasInitialPersonOption ? (
            <option value={initialPersonProfileId}>
              Persona no disponible
            </option>
          ) : null}
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.display_name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Centro</span>
        <select
          className={selectClassName}
          name="centerId"
          onChange={(event) => {
            setCenterId(event.currentTarget.value);
          }}
          value={centerId}
        >
          <option value="">Toda la organizacion</option>
          {activeCenters.map((center) => (
            <option key={center.id} value={center.id}>
              {center.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
