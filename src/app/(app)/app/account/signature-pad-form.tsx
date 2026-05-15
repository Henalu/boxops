"use client";

import type React from "react";
import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eraser, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  SIGNATURE_MAX_SIZE_BYTES,
  formatSignatureFileSize,
} from "@/lib/profile-signatures";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 260;

type Point = {
  x: number;
  y: number;
};

type SignaturePadFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  hasSignature: boolean;
  organizationId: string;
};

function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: Pick<React.PointerEvent, "clientX" | "clientY">,
) {
  const rect = canvas.getBoundingClientRect();
  const rectWidth = rect.width || canvas.width;
  const rectHeight = rect.height || canvas.height;
  const x = ((event.clientX - rect.left) / rectWidth) * canvas.width;
  const y = ((event.clientY - rect.top) / rectHeight) * canvas.height;

  return {
    x: Math.min(Math.max(x, 0), canvas.width),
    y: Math.min(Math.max(y, 0), canvas.height),
  };
}

function getSignatureSizeFromDataUrl(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;

  return Math.floor((base64.length * 3) / 4) - padding;
}

function SignatureActions({
  hasInk,
  hasSignature,
  onClear,
}: {
  hasInk: boolean;
  hasSignature: boolean;
  onClear: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <Button
        disabled={pending}
        type="submit"
        variant={hasSignature ? "outline" : "default"}
      >
        <Save aria-hidden="true" />
        {pending
          ? "Guardando..."
          : hasSignature
            ? "Reemplazar firma"
            : "Guardar firma"}
      </Button>
      <Button
        disabled={!hasInk || pending}
        onClick={onClear}
        type="button"
        variant="ghost"
      >
        <Eraser aria-hidden="true" />
        Limpiar
      </Button>
    </>
  );
}

export function SignaturePadForm({
  action,
  hasSignature,
  organizationId,
}: SignaturePadFormProps) {
  const hintId = useId();
  const messageId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDrawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function prepareContext(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = "#171717";
    context.fillStyle = "#171717";

    return context;
  }

  function syncSignatureInput() {
    const canvas = canvasRef.current;
    const input = inputRef.current;

    if (!canvas || !input || !hasInkRef.current) {
      return false;
    }

    const dataUrl = canvas.toDataURL("image/png");
    const signatureSize = getSignatureSizeFromDataUrl(dataUrl);

    if (signatureSize > SIGNATURE_MAX_SIZE_BYTES) {
      input.value = "";
      setMessage(
        `La firma no puede superar ${formatSignatureFileSize(
          SIGNATURE_MAX_SIZE_BYTES,
        )}.`,
      );
      return false;
    }

    input.value = dataUrl;
    return true;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    event.preventDefault();
    try {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    } catch {
      // Some browsers can refuse capture when the pointer is already released.
    }
    isDrawingRef.current = true;

    const point = getCanvasPoint(canvas, event);
    const context = prepareContext(canvas);

    if (!context) {
      return;
    }

    context.beginPath();
    context.arc(point.x, point.y, 1.75, 0, Math.PI * 2);
    context.fill();
    lastPointRef.current = point;
    hasInkRef.current = true;
    setHasInk(true);
    setMessage(null);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    const lastPoint = lastPointRef.current;

    if (!canvas || !isDrawingRef.current || !lastPoint) {
      return;
    }

    event.preventDefault();

    const point = getCanvasPoint(canvas, event);
    const context = prepareContext(canvas);

    if (!context) {
      return;
    }

    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  }

  function stopDrawing(event: React.PointerEvent<HTMLDivElement>) {
    if (isDrawingRef.current) {
      syncSignatureInput();
    }

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Capture may already be gone after touch cancellation or window changes.
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setHasInk(false);
    setMessage(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const canvas = canvasRef.current;
    const input = inputRef.current;

    if (!canvas || !input || !hasInkRef.current) {
      event.preventDefault();
      setMessage("Dibuja tu firma antes de guardarla.");
      return;
    }

    if (!syncSignatureInput()) {
      event.preventDefault();
      return;
    }

    setMessage(null);
  }

  return (
    <form action={action} className="grid gap-3" onSubmit={handleSubmit}>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="signatureDataUrl" ref={inputRef} type="hidden" />

      <div
        className="relative touch-none select-none"
        onPointerCancel={stopDrawing}
        onPointerDown={handlePointerDown}
        onPointerLeave={stopDrawing}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        style={{ touchAction: "none" }}
      >
        {!hasInk ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Dibuja aqui tu firma con el raton, trackpad o dedo.
          </div>
        ) : null}
        <canvas
          aria-label="Area para dibujar mi firma"
          aria-describedby={message ? `${hintId} ${messageId}` : hintId}
          className="h-auto w-full cursor-crosshair rounded-lg border border-border bg-background shadow-inner outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          height={CANVAS_HEIGHT}
          ref={canvasRef}
          role="img"
          tabIndex={0}
          width={CANVAS_WIDTH}
        />
      </div>
      <span className="sr-only" id={hintId}>
        Dibuja tu firma en el area antes de guardarla.
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <SignatureActions
          hasInk={hasInk}
          hasSignature={hasSignature}
          onClear={handleClear}
        />
        <span className="text-xs text-muted-foreground">
          PNG hasta {formatSignatureFileSize(SIGNATURE_MAX_SIZE_BYTES)}.
        </span>
      </div>

      {message ? (
        <p
          aria-live="polite"
          className="text-sm font-medium text-destructive"
          id={messageId}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
