import { createGeminiClient } from "./gemini";
import { extractPdfText } from "./pdf";
import { processDocument } from "./process-document";
import { sendWebhook } from "./webhook";
import type { IEPExtraction } from "./extraction-schema";

export interface UploadDocumentDeps {
  putObject: (storagePath: string, fileBuffer: ArrayBuffer) => Promise<void>;
  insertDocument: (storagePath: string, originalFilename: string) => Promise<string>;
  geminiApiKey: string;
  insertExtraction: (documentId: string, extraction: IEPExtraction) => Promise<void>;
  updateDocumentStatus: (
    documentId: string,
    status: "done" | "failed",
    errorMessage?: string | null
  ) => Promise<void>;
  webhookUrl: string | undefined;
  webhookSecret: string | undefined;
  waitUntil: (promise: Promise<unknown>) => void;
}

// Shared by app/api/upload/route.ts (the public, API-key-checked endpoint)
// and app/actions.ts (the dashboard's own upload Server Action) so the
// store-then-kick-off-processing logic isn't duplicated between them.
// Auth (the X-API-Key check) is deliberately NOT here - it belongs to
// whichever entry point actually crosses the network (route.ts), not to
// this shared internal helper.
export async function handleUpload(
  fileBuffer: ArrayBuffer,
  originalFilename: string,
  deps: UploadDocumentDeps
): Promise<{ documentId: string }> {
  const storagePath = `documents/${crypto.randomUUID()}.pdf`;
  await deps.putObject(storagePath, fileBuffer);
  const documentId = await deps.insertDocument(storagePath, originalFilename);

  deps.waitUntil(
    processDocument(documentId, {
      fetchDocumentText: () => extractPdfText(fileBuffer),
      geminiClient: createGeminiClient(deps.geminiApiKey),
      supabase: {
        insertExtraction: (extraction) => deps.insertExtraction(documentId, extraction),
        updateDocumentStatus: (status, errorMessage) =>
          deps.updateDocumentStatus(documentId, status, errorMessage ?? null),
      },
      sendWebhook,
      webhookUrl: deps.webhookUrl,
      webhookSecret: deps.webhookSecret,
    })
  );

  return { documentId };
}
