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

type CreationAssignmentOption =
  ChangeRequestCreationOptions["assignmentOptions"][number];

const creationRequestTypeOptions = [
  {
    description:
      "Para que otro entrenador te cubra ese dia o intercambie turno contigo.",
    label: "Pedir cobertura",
    value: "coverage_request",
  },
  {
    description: "Ofrecer tu clase a entrenadores concretos.",
    label: "Oferta de cobertura",
    value: "offer_block",
  },
  {
    description: "Pedir un cambio sobre tu propia clase.",
    label: "Pedir cambio",
    value: "own_block_change",
  },
] as const;

type CreationRequestTypeOptionValue =
  (typeof creationRequestTypeOptions)[number]["value"];

const restrictionLabels: Record<
  ChangeRequestCreationTargetRestrictionReason,
  string
> = {
  "already-assigned": "Ya cubre esta clase",
  overlap: "Tiene otra clase en esa franja",
  "source-coach": "Es quien solicita",
};

function formatTime(value: string) {
  return value.slice(0, 5) || value;
}

function compareAssignmentOptions(
  left: CreationAssignmentOption,
  right: CreationAssignmentOption,
) {
  return (
    left.serviceDate.localeCompare(right.serviceDate) ||
    left.startTime.localeCompare(right.startTime) ||
    left.endTime.localeCompare(right.endTime) ||
    left.centerName.localeCompare(right.centerName) ||
    left.classTypeName.localeCompare(right.classTypeName) ||
    left.coachName.localeCompare(right.coachName)
  );
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
  const sortedAssignmentOptions = [
    ...creationOptions.assignmentOptions,
  ].sort(compareAssignmentOptions);

  return (
    sortedAssignmentOptions.find(
      (assignment) => assignment.assignmentId === selectedAssignmentId,
    )?.assignmentId ??
    sortedAssignmentOptions.find(
      (assignment) => assignment.blockId === selectedBlockId,
    )?.assignmentId ??
    sortedAssignmentOptions[0]?.assignmentId ??
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
  const [selectedServiceDate, setSelectedServiceDate] = useState(() => {
    const initialAssignmentId = getInitialAssignmentId({
      creationOptions,
      selectedAssignmentId,
      selectedBlockId,
    });

    return (
      creationOptions.assignmentOptions.find(
        (assignment) => assignment.assignmentId === initialAssignmentId,
      )?.serviceDate ?? ""
    );
  });
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [currentRequestType, setCurrentRequestType] =
    useState<CreationRequestTypeOptionValue>("coverage_request");

  const sortedAssignmentOptions = useMemo(
    () => [...creationOptions.assignmentOptions].sort(compareAssignmentOptions),
    [creationOptions.assignmentOptions],
  );
  const assignmentsForSelectedDate = useMemo(
    () =>
      sortedAssignmentOptions.filter(
        (assignment) => assignment.serviceDate === selectedServiceDate,
      ),
    [selectedServiceDate, sortedAssignmentOptions],
  );
  const currentAssignment = useMemo(
    () =>
      sortedAssignmentOptions.find(
        (assignment) => assignment.assignmentId === currentAssignmentId,
      ) ?? null,
    [currentAssignmentId, sortedAssignmentOptions],
  );
  const currentRequestTypeDescription =
    creationRequestTypeOptions.find(
      (option) => option.value === currentRequestType,
    )?.description ?? creationRequestTypeOptions[0].description;
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
  const availableTargetCount = currentAssignment
    ? creationOptions.targetOptions.filter(
        (target) => !restrictionByTargetId.has(target.coachProfileId),
      ).length
    : 0;
  const canSubmit =
    Boolean(currentAssignment) &&
    selectedTargetIds.length > 0 &&
    availableTargetCount > 0;

  function handleAssignmentChange(nextAssignmentId: string) {
    const nextAssignment =
      sortedAssignmentOptions.find(
        (assignment) => assignment.assignmentId === nextAssignmentId,
      ) ?? null;
    const nextRestrictedTargetIds = new Set(
      (nextAssignment?.targetRestrictions ?? []).map(
        (restriction) => restriction.coachProfileId,
      ),
    );

    setCurrentAssignmentId(nextAssignmentId);
    if (nextAssignment?.serviceDate) {
      setSelectedServiceDate(nextAssignment.serviceDate);
    } else {
      setSelectedTargetIds([]);
      return;
    }
    setSelectedTargetIds((current) =>
      current.filter((targetId) => !nextRestrictedTargetIds.has(targetId)),
    );
  }

  function handleServiceDateChange(nextServiceDate: string) {
    const nextAssignment = sortedAssignmentOptions.find(
      (assignment) => assignment.serviceDate === nextServiceDate,
    );

    setSelectedServiceDate(nextServiceDate);
    handleAssignmentChange(nextAssignment?.assignmentId ?? "");
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
        description="Pide que otro entrenador te cubra o intercambie una clase contigo."
        title="Pedir cobertura"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Clase y destinatarios</CardTitle>
              <CardDescription>
                Elige primero el dia, despues la clase y los entrenadores que
                podrian cubrirla.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {creationOptions.canManage ? "Gestion" : "Propia"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {creationOptions.assignmentOptions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="font-medium">No hay clases para pedir cobertura</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No encontramos clases asignadas disponibles. Revisa el horario
                o cambia de organizacion si trabajas en otra.
              </p>
            </div>
          ) : creationOptions.targetOptions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="font-medium">
                No hay entrenadores para solicitar cobertura
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                No encontramos entrenadores activos que puedan recibir
                solicitudes en esta organizacion.
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
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(150px,0.42fr)_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <Label htmlFor="requestServiceDate">Fecha</Label>
                      <Input
                        id="requestServiceDate"
                        onChange={(event) =>
                          handleServiceDateChange(event.currentTarget.value)
                        }
                        required
                        type="date"
                        value={selectedServiceDate}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="scheduleBlockAssignmentId">
                        Clase de ese dia
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
                        {assignmentsForSelectedDate.length === 0 ? (
                          <option disabled value="">
                            No hay clases asignadas ese dia
                          </option>
                        ) : null}
                        {assignmentsForSelectedDate.map((assignment) => (
                          <option
                            key={assignment.assignmentId}
                            value={assignment.assignmentId}
                          >
                            {formatTime(assignment.startTime)}-
                            {formatTime(assignment.endTime)} /{" "}
                            {assignment.classTypeName} /{" "}
                            {assignment.centerName}
                            {creationOptions.canManage
                              ? ` / ${assignment.coachName}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {creationOptions.canManage
                      ? "En gestion puedes preparar cobertura de clases del equipo."
                      : "Solo aparecen clases asignadas a tu usuario."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requestType">Tipo de solicitud</Label>
                  <select
                    className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    id="requestType"
                    name="requestType"
                    onChange={(event) =>
                      setCurrentRequestType(
                        event.currentTarget.value as CreationRequestTypeOptionValue,
                      )
                    }
                    required
                    value={currentRequestType}
                  >
                    {creationRequestTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {currentRequestTypeDescription}
                  </p>
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="sr-only">Destinatarios</legend>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <p className="text-sm font-medium">Entrenadores</p>
                  <span className="text-xs text-muted-foreground">
                    {availableTargetCount} disponibles
                  </span>
                </div>
                {availableTargetCount === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                    Nadie aparece disponible para esta clase. Prueba con otra
                    clase o revisa los solapes en el horario.
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {creationOptions.targetOptions.map((target) => {
                    const restriction = restrictionByTargetId.get(
                      target.coachProfileId,
                    );
                    const disabled = !currentAssignment || Boolean(restriction);

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
                            {!currentAssignment
                              ? "Elige una clase primero"
                              : restriction
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
                  <Label htmlFor="reasonSummary">Mensaje para el equipo</Label>
                  <Textarea
                    id="reasonSummary"
                    maxLength={160}
                    name="reasonSummary"
                    placeholder="Ej. Alguien puede cubrirme esta clase?"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiresAt">Responder antes de</Label>
                  <Input id="expiresAt" name="expiresAt" type="datetime-local" />
                  <p className="text-xs text-muted-foreground">
                    Opcional. No puede superar 30 dias desde hoy.
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
                  Entiendo que esta solicitud organiza cobertura o intercambio
                  sobre esta clase. Las ausencias, nominas y horas extra se
                  gestionan aparte.
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <RequestCreationSubmitButton disabled={!canSubmit} />
                <p className="text-sm text-muted-foreground">
                  Los entrenadores seleccionados recibiran la solicitud en su
                  bandeja.
                </p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
