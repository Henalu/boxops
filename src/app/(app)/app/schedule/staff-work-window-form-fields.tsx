import { Input } from "@/components/ui/input";
import {
  STAFF_WORK_WINDOW_STATUSES,
  formatStaffWorkWindowTime,
  getStaffWorkWindowDayLabel,
  getStaffWorkWindowStatusLabel,
  type StaffWorkWindowCenterOption,
  type StaffWorkWindowDisplay,
  type StaffWorkWindowPersonOption,
} from "@/lib/staff-work-windows";

import { StaffWorkWindowPersonCenterSelects } from "./staff-work-window-person-center-selects";

const selectClassName = [
  "h-11 w-full min-w-0 truncate rounded-lg border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
  "outline-none transition-colors focus-visible:border-ring",
  "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export function StaffWorkWindowFields({
  activeCenters,
  defaultDayOfWeek = 1,
  defaultValidFrom,
  multiDay = false,
  people,
  window,
}: {
  activeCenters: StaffWorkWindowCenterOption[];
  defaultDayOfWeek?: number;
  defaultValidFrom?: string;
  multiDay?: boolean;
  people: StaffWorkWindowPersonOption[];
  window?: StaffWorkWindowDisplay;
}) {
  const selectedDayOfWeek = window?.day_of_week ?? defaultDayOfWeek;

  return (
    <>
      <StaffWorkWindowPersonCenterSelects
        activeCenters={activeCenters}
        defaultCenterId={window ? window.center_id ?? "" : undefined}
        defaultPersonProfileId={window?.person_profile_id ?? people[0]?.id ?? ""}
        people={people}
        preferPersonCenterOnInitial={!window}
      />

      {multiDay ? (
        <fieldset className="grid min-w-0 gap-2 md:col-span-2 xl:col-span-2">
          <legend className="text-sm font-medium">Dias</legend>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-4">
            {Array.from({ length: 7 }, (_, index) => index + 1).map((day) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-muted/45 has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground md:min-h-9"
                key={day}
              >
                <input
                  className="size-4 shrink-0 rounded border-input accent-current"
                  defaultChecked={day === selectedDayOfWeek}
                  name="dayOfWeek"
                  type="checkbox"
                  value={day}
                />
                <span className="min-w-0 truncate">
                  {getStaffWorkWindowDayLabel(day)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Dia</span>
          <select
            className={selectClassName}
            defaultValue={String(selectedDayOfWeek)}
            name="dayOfWeek"
            required
          >
            {Array.from({ length: 7 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {getStaffWorkWindowDayLabel(day)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          defaultValue={window ? formatStaffWorkWindowTime(window.start_time) : ""}
          name="startTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          defaultValue={window ? formatStaffWorkWindowTime(window.end_time) : ""}
          name="endTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Desde</span>
        <Input
          defaultValue={window?.valid_from ?? defaultValidFrom ?? ""}
          name="validFrom"
          required
          type="date"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Hasta</span>
        <Input
          defaultValue={window?.valid_until ?? ""}
          name="validUntil"
          type="date"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Estado</span>
        <select
          className={selectClassName}
          defaultValue={window?.status ?? "active"}
          name="status"
        >
          {STAFF_WORK_WINDOW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStaffWorkWindowStatusLabel(status)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid min-w-0 gap-2 md:col-span-2 xl:col-span-4">
        <span className="text-sm font-medium">Notas</span>
        <Input
          defaultValue={window?.notes ?? ""}
          maxLength={240}
          name="notes"
          placeholder="Nota operativa corta, sin datos sensibles"
        />
      </label>
    </>
  );
}
