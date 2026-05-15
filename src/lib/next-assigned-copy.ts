import type { OwnNextAssignedScheduleBlock } from "@/lib/own-schedule";

export function formatMinutesDistance(minutes: number) {
  if (minutes <= 0) {
    return "ahora";
  }

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;

  if (days > 0) {
    return `${days} d${hours > 0 ? ` ${hours} h` : ""}`;
  }

  if (hours > 0) {
    return `${hours} h${remainingMinutes > 0 ? ` ${remainingMinutes} min` : ""}`;
  }

  return `${minutes} min`;
}

export function getNextAssignedLeadCopy(block: OwnNextAssignedScheduleBlock) {
  if (block.isOngoing) {
    return `En curso, termina en ${formatMinutesDistance(block.minutesUntilEnd)}`;
  }

  return `Falta ${formatMinutesDistance(block.minutesUntilStart)}`;
}
