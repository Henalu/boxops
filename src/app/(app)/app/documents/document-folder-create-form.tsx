"use client";

import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { createDocumentFolderFromClient } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type DocumentFolderPersonOption = {
  display_name: string;
  id: string;
};

function selectClassName(className = "") {
  return cn(
    "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:h-9",
    className,
  );
}

export function DocumentFolderCreateForm({
  defaultScope,
  organizationId,
  people,
}: {
  defaultScope: string;
  organizationId: string;
  people: DocumentFolderPersonOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSubmitError(null);

    startTransition(async () => {
      try {
        const result = await createDocumentFolderFromClient(formData);
        formRef.current?.reset();
        router.push(result.path);
        router.refresh();
      } catch {
        setSubmitError("No se pudo crear la carpeta. Revisa los datos y vuelve a intentarlo.");
      }
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} ref={formRef}>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="scope" type="hidden" value={defaultScope} />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Nombre</span>
          <Input
            maxLength={120}
            name="folderName"
            placeholder="Programación"
            required
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Visibilidad</span>
          <select
            className={selectClassName()}
            defaultValue="management"
            name="folderVisibility"
          >
            <option value="management">Solo gestión</option>
            <option value="all">Todo el equipo</option>
            <option value="people">Personas concretas</option>
          </select>
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Descripción opcional</span>
        <Textarea
          maxLength={500}
          name="folderDescription"
          placeholder="Para qué se usa esta carpeta."
        />
      </label>

      {people.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Personas concretas</legend>
          <div className="grid max-h-36 gap-2 overflow-y-auto rounded-lg border border-border bg-background/80 p-2 sm:grid-cols-2">
            {people.map((person) => (
              <label
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                key={person.id}
              >
                <input
                  className="size-4 shrink-0 accent-primary"
                  name="personProfileIds"
                  type="checkbox"
                  value={person.id}
                />
                <span className="truncate">{person.display_name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Solo se usa cuando la visibilidad es Personas concretas.
          </p>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="w-full sm:w-auto" disabled={isPending} type="submit">
          <FolderPlus aria-hidden="true" />
          {isPending ? "Creando..." : "Crear carpeta"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Los documentos heredarán esta visibilidad.
        </p>
      </div>
      {submitError ? (
        <p className="text-sm text-destructive">{submitError}</p>
      ) : null}
    </form>
  );
}
