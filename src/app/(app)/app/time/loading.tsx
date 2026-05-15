import { Clock } from "lucide-react";

import { PageHeader } from "@/components/features/operations-ui";
import { Card, CardContent } from "@/components/ui/card";

export default function TimeLoading() {
  return (
    <div className="space-y-6">
      <PageHeader
        badge="Fichaje"
        description="Cargando registros y correcciones de la organización activa."
        title="Mi fichaje"
      />

      <Card>
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <Clock aria-hidden="true" className="size-4 animate-pulse" />
          Cargando fichaje y revisión de correcciones...
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Card key={item} size="sm">
            <CardContent className="space-y-3">
              <div className="h-4 w-32 rounded-md bg-muted" />
              <div className="h-8 w-24 rounded-md bg-muted" />
              <div className="hidden h-4 w-full rounded-md bg-muted md:block" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
