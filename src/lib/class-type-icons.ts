export const DEFAULT_CLASS_TYPE_ICON_KEY = "activity";

export const CLASS_TYPE_ICON_OPTIONS = [
  { key: "activity", label: "Actividad" },
  { key: "dumbbell", label: "Fuerza" },
  { key: "biceps-flexed", label: "Musculación" },
  { key: "flame", label: "Intensidad" },
  { key: "timer", label: "Intervalos" },
  { key: "zap", label: "Energía" },
  { key: "heart-pulse", label: "Cardio" },
  { key: "target", label: "Técnica" },
  { key: "gauge", label: "Rendimiento" },
  { key: "stretch-horizontal", label: "Movilidad" },
  { key: "footprints", label: "Running" },
  { key: "bike", label: "Bike" },
  { key: "waves", label: "Agua" },
  { key: "clipboard-check", label: "Control" },
  { key: "shield-check", label: "Certificación" },
  { key: "users", label: "Grupo" },
  { key: "calendar-days", label: "Evento" },
  { key: "trophy", label: "Competición" },
  { key: "medal", label: "Marca" },
  { key: "party-popper", label: "Especial" },
  { key: "sun", label: "Día" },
  { key: "moon", label: "Noche" },
] as const;

export type ClassTypeIconKey = (typeof CLASS_TYPE_ICON_OPTIONS)[number]["key"];

export function isClassTypeIconKey(
  value: string,
): value is ClassTypeIconKey {
  return CLASS_TYPE_ICON_OPTIONS.some((option) => option.key === value);
}

export function getClassTypeIconLabel(value: string | null | undefined) {
  const option = CLASS_TYPE_ICON_OPTIONS.find(
    (candidate) => candidate.key === value,
  );

  return option?.label ?? "Actividad";
}

export function getClassTypeIconKey(
  value: string | null | undefined,
): ClassTypeIconKey {
  const candidate = value ?? "";

  return isClassTypeIconKey(candidate)
    ? candidate
    : DEFAULT_CLASS_TYPE_ICON_KEY;
}
