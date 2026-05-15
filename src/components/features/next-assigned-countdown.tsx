"use client";

import { useEffect, useState } from "react";

import { formatMinutesDistance } from "@/lib/next-assigned-copy";

function getCountdownLabel({
  endAt,
  initialLabel,
  now,
  startAt,
}: {
  endAt: string;
  initialLabel: string;
  now: number;
  startAt: string;
}) {
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return initialLabel;
  }

  if (now < startMs) {
    return `Falta ${formatMinutesDistance(
      Math.ceil((startMs - now) / 60_000),
    )}`;
  }

  if (now < endMs) {
    return `En curso, termina en ${formatMinutesDistance(
      Math.ceil((endMs - now) / 60_000),
    )}`;
  }

  return "Actualiza para ver la siguiente";
}

export function NextAssignedCountdown({
  endAt,
  initialLabel,
  startAt,
}: {
  endAt: string;
  initialLabel: string;
  startAt: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    function updateNow() {
      setNow(Date.now());
    }

    updateNow();
    const interval = window.setInterval(updateNow, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const label =
    now === null
      ? initialLabel
      : getCountdownLabel({ endAt, initialLabel, now, startAt });

  return <span suppressHydrationWarning>{label}</span>;
}
