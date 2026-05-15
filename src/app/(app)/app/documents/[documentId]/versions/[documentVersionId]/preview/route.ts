import type { NextRequest } from "next/server";

import { handleDocumentVersionFileAccess } from "@/lib/document-file-access";

export const dynamic = "force-dynamic";

type DocumentVersionFileRouteContext = {
  params: Promise<{
    documentId: string;
    documentVersionId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: DocumentVersionFileRouteContext,
) {
  const { documentId, documentVersionId } = await context.params;

  return handleDocumentVersionFileAccess({
    documentId,
    documentVersionId,
    mode: "preview",
    request,
  });
}
