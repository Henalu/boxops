"use client";

import { useMemo, useState } from "react";

import { RequestCreationSubmitButton } from "./creation-submit-button";
import { SectionHeader } from "@/components/features/operations-ui";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ChangeRequestCreationOptions,
  ChangeRequestCreationTargetRestrictionReason,
} from "@/lib/change-requests";
import { cn } from "@/lib/utils";

type RequestCreationFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  creationOptions: ChangeRequestCreationOptions;
  organizationId: string;
  selectedAssignmentId?: string | null;
  selectedBlockId?: string | null;
};

const creationRequestTypeOptions = [
  {
    description: "Pedir ayuda para cubrir una clase ya asignada.",
    label: "Pedir cobertura",
    value: "coverage_request",
  },
  {
    description: "Ofrecer una clase a entrenadores concretos.",
    label: "Oferta de cobertura",
    value: "offer_block",
  },
  {
    description: "Pedir un ajuste sobre tu propia clase.",
    label: "Cambio propio",
    value: "own_block_change",
  },
] as const;

const restrictionLabels: Record<
  ChangeRequestCreationTargetRestrictionReason,
  string
> = {
  "already-assigned": "Ya cubre este bloque",
  overlap: "Solapa con otro bloque asignado",
  "source-coach": "Es el coach origen",
};

function formatServiceDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
      weekday: "short",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatTime(value: string) {
  return value.slice(0, 5) || value;
}

function getInitialAssignmentId({
  creationOptions,
  selectedAssignmentId,
  selectedBlockId,
}: {
  creationOptions: ChangeRequestCreationOptions;
  selectedAssignmentId?: string | null;
  selectedBlockId?: string | null;
}) {
  return (
    creationOptions.assignmentOptions.find(
      (assignment) => assignment.assignmentId === selectedAssignmentId,
    )?.assignmentId ??
    creationOptions.assignmentOptions.find(
      (assignment) => assignment.blockId === selectedBlockId,
    )?.assignmentId ??
    creationOptions.assignmentOptions[0]?.assignmentId ??
    ""
  );
}

export function RequestCreationForm({
  action,
  creationOptions,
  organizationId,
  selectedAssignmentId,
  selectedBlockId,
}: RequestCreationFormProps) {
  const [currentAssignmentId, setCurrentAssignmentId] = useState(() =>
    getInitialAssignmentId({
      creationOptions,
      selectedAssignmentId,
      selectedBlockId,
    }),
  );
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);

  const currentAssignment = useMemo(
    () =>
      creationOptions.assignmentOptions.find(
        (assignment) => assignment.assignmentId === currentAssignmentId,
      ) ?? null,
    [creationOptions.assignmentOptions, currentAssignmentId],
  );
  const restrictionByTargetId = useMemo(
    () =>
      new Map(
        (currentAssignment?.targetRestrictions ?? []).map((restriction) => [
          restriction.coachProfileId,
          restriction.reason,
        ]),
      ),
    [currentAssignment],
  );
  const availableTargetCount = creationOptions.targetOptions.filter(
    (target) => !restrictionByTargetId.has(target.coachProfileId),
  ).length;
  const canSubmit = selectedTargetIds.length > 0 && availableTargetCount > 0;

  function handleAssignmentChange(nextAssignmentId: string) {
    const nextAssignment =
      creationOptions.assignmentOptions.find(
        (assignment) => assignment.assignmentId === nextAssignmentId,
      ) ?? null;
    const nextRestrictedTargetIds = new Set(
      (nextAssignment?.targetRestrictions ?? []).map(
        (restriction) => restriction.coachProfileId,
      ),
    );

    setCurrentAssignmentId(nextAssignmentId);
    setSelectedTargetIds((current) =>
      current.filter((targetId) => !nextRestrictedTargetIds.has(targetId)),
    );
  }

  function handleTargetChange(targetId: string, checked: boolean) {
    setSelectedTargetIds((current) => {
      if (checked) {
        return current.includes(targetId) ? current : [...current, targetId];
      }

      return current.filter((currentTargetId) => currentTargetId !== targetId);
    });
  }

  return (
    <section className="space-y-3">
      <SectionHeader
        description="Elige una clase del horario y a qué entrenadores quieres pedir ayuda."
        title="Pedir cobertura"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Solicitud de cobertura</CardTitle>
              <CardDescription>
                Usa una clase ya asignada en el horario. Solo aparecerán
                entrenadores disponibles para esa franja.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {creationOptions.canManage ? "Gestión" : "Propia"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {creationOptions.assignmentOptions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="font-medium">No hay clases disponibles</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ahora mismo no hay clases asignadas que puedas usar para crear
                una solicitud. Revisa el horario o cambia de organización si
                trabajas en otra.
              </p>
            </div>
          ) : creationOptions.targetOptions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="font-medium">No hay entrenadores disponibles</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No hay entrenadores activos que puedan recibir esta solicitud
                en este momento.
              </p>
            </div>
          ) : (
            <form action={action} className="space-y-5">
              <input
                name="organizationId"
                type="hidden"
                value={organizationId}
              />

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)]">
                <div className="space-y-2">
                  <Label htmlFor="scheduleBlockAssignmentId">
                    Clase
                  </Label>
                  <select
                    className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    id="scheduleBlockAssignmentId"
                    name="scheduleBlockAssignmentId"
                    onChange={(event) =>
                      handleAssignmentChange(event.currentTarget.value)
                    }
                    required
                    value={currentAssignmentId}
                  >
                    {creationOptions.assignmentOptions.map((assignment) => (
                      <option
                        key={assignment.assignmentId}
                        value={assignment.assignmentId}
                      >
                        {formatServiceDate(assignment.serviceDate)} /{" "}
                        {formatTime(assignment.startTime)}-
                        {formatTime(assignment.endTime)} /{" "}
                        {assignment.classTypeName} / {assignment.centerName} /{" "}
                        {assignment.coachName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requestType">Qué quieres hacer</Label>
                  <select
                    className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue="coverage_request"
                    id="requestType"
                    name="requestType"
                    required
                  >
                    {creationRequestTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Esta solicitud solo gestiona cobertura del horario.
                  </p>
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="sr-only">Destinatarios</legend>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <p className="text-sm font-medium">Destinatarios</p>
                  <span className="text-xs text-muted-foreground">
                    {availableTargetCount} disponibles para esta clase
                  </span>
                </div>
                {availableTargetCount === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                    La clase seleccionada no tiene entrenadores disponibles.
                    Cambia de clase o revisa si hay solapes en el horario.
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {creationOptions.targetOptions.map((target) => {
                    const restriction = restrictionByTargetId.get(
                      target.coachProfileId,
                    );
                    const disabled = Boolean(restriction);

                    return (
                      <label
                        className={cn(
                          "flex min-h-16 items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm",
                          disabled && "bg-muted/45 text-muted-foreground",
                        )}
                        key={target.coachProfileId}
                      >
                        <input
                          checked={
                            !disabled &&
                            selectedTargetIds.includes(target.coachProfileId)
                          }
                          className="mt-1 size-4 rounded border-input"
                          disabled={disabled}
                          name="targetCoachProfileIds"
                          onChange={(event) =>
                            handleTargetChange(
                              target.coachProfileId,
                              event.currentTarget.checked,
                            )
                          }
                          type="checkbox"
                          value={target.coachProfileId}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {target.displayName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {restriction
                              ? restrictionLabels[restriction]
                              : target.detail}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-2">
                  <Label htmlFor="reasonSummary">Mensaje opcional</Label>
                  <Textarea
                    id="reasonSummary"
                    maxLength={160}
                    name="reasonSummary"
                    placeholder="Ej. Necesito ayuda para cubrir esta clase."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiresAt">Responder antes de</Label>
                  <Input id="expiresAt" name="expiresAt" type="datetime-local" />
                  <p className="text-xs text-muted-foreground">
                    Opcional. Como máximo, 30 días desde hoy.
                  </p>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-lg bg-muted/45 px-3 py-2 text-sm">
                <input
                  className="mt-1 size-4 rounded border-input"
                  name="creationConfirmed"
                  required
                  type="checkbox"
                />
                <span>
                  Entiendo que esta solicitud solo sirve para cubrir una clase
                  del horario. No registra ausencias, nóminas ni horas extra
                  aprobadas.
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <RequestCreationSubmitButton disabled={!canSubmit} />
                <p className="text-sm text-muted-foreground">
                  Al enviar, los entrenadores seleccionados recibirán la oferta
                  de cobertura.
                </p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
