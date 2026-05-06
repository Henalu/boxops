import Link from "next/link";
import { Building2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActiveOrganizationResolution } from "@/lib/auth/tenant";
import { getAppPath } from "@/lib/navigation/app-paths";

type OrganizationResolutionStateProps = {
  basePath: string;
  resolution: Extract<ActiveOrganizationResolution, { ok: false }>;
};

const resolutionCopy = {
  no_active_memberships: {
    title: "No hay organizaciones activas",
    description:
      "Tu usuario existe, pero aún no tiene acceso activo a ningún box.",
  },
  organization_required: {
    title: "Elige una organización",
    description:
      "Este usuario pertenece a más de una organización. Selecciona una de forma explícita para continuar.",
  },
  organization_not_found: {
    title: "Organización no disponible",
    description:
      "La organización solicitada no existe para este usuario o no está activa.",
  },
};

export function OrganizationResolutionState({
  basePath,
  resolution,
}: OrganizationResolutionStateProps) {
  const copy = resolutionCopy[resolution.reason];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {resolution.reason === "organization_required" ? (
          <div className="grid gap-2 sm:max-w-xl">
            {resolution.memberships.map((membership) => (
              <Button
                asChild
                className="h-auto justify-start py-3"
                key={membership.id}
                variant="outline"
              >
                <Link
                  href={getAppPath(basePath, {
                    organizationId: membership.organization_id,
                  })}
                >
                  <Building2 aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    {membership.organization.name}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {membership.role}
                  </span>
                </Link>
              </Button>
            ))}
          </div>
        ) : (
          <Alert>
            <AlertTitle>Acceso pendiente</AlertTitle>
            <AlertDescription>
              Pide a un admin que revise tu acceso antes de entrar en el área
              protegida.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
