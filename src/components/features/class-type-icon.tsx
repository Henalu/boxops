import type { LucideIcon } from "lucide-react";
import { createElement, type CSSProperties } from "react";
import {
  Activity,
  BicepsFlexed,
  Bike,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Medal,
  Moon,
  PartyPopper,
  ShieldCheck,
  StretchHorizontal,
  Sun,
  Target,
  Timer,
  Trophy,
  Users,
  Waves,
  Zap,
} from "lucide-react";

import { getClassTypeIconKey } from "@/lib/class-type-icons";

const classTypeIconMap = {
  activity: Activity,
  "biceps-flexed": BicepsFlexed,
  bike: Bike,
  "calendar-days": CalendarDays,
  "clipboard-check": ClipboardCheck,
  dumbbell: Dumbbell,
  flame: Flame,
  footprints: Footprints,
  gauge: Gauge,
  "heart-pulse": HeartPulse,
  medal: Medal,
  moon: Moon,
  "party-popper": PartyPopper,
  "shield-check": ShieldCheck,
  "stretch-horizontal": StretchHorizontal,
  sun: Sun,
  target: Target,
  timer: Timer,
  trophy: Trophy,
  users: Users,
  waves: Waves,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export function getClassTypeIcon(iconKey: string | null | undefined) {
  return classTypeIconMap[getClassTypeIconKey(iconKey)];
}

export function ClassTypeIcon({
  className,
  iconKey,
  style,
}: {
  className?: string;
  iconKey: string | null | undefined;
  style?: CSSProperties;
}) {
  const Icon = getClassTypeIcon(iconKey);

  return createElement(Icon, {
    "aria-hidden": true,
    className,
    style,
  });
}
