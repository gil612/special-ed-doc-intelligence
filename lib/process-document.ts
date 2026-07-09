import { redactText } from "./redact";
import { extractIEP, type GeminiClient } from "./gemini";
import { sendWebhook, type WebhookPayload } from "./webhook";
import type { IEPExtraction } from "./extraction-schema";

export interface ProcessDocumentDeps {
  fetchDocumentText: () => Promise<string>;
  geminiClient: GeminiClient;
  supabase: {
    insertExtraction: (extraction: IEPExtraction) => Promise<void>;
    updateDocumentStatus: (status: "done" | "failed", errorMessage?: string | null) => Promise<void>;
  };
  sendWebhook: typeof sendWebhook;
  webhookUrl: string | undefined;
  webhookSecret: string | undefined;
}

export async function processDocument(documentId: string, deps: ProcessDocumentDeps): Promise<void> {
  // Only the extraction itself (fetch -> redact -> Gemini -> validate) is
  // "did this document fail to extract." A failure here means there is no
  // extraction to persist, so marking the document failed is correct.
  let extraction: IEPExtraction;
  try {
    const rawText = await deps.fetchDocumentText();
    const { redactedText } = redactText(rawText);
    extraction = await extractIEP(redactedText, deps.geminiClient);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await deps.supabase.updateDocumentStatus("failed", message);

    const payload: WebhookPayload = {
      document_id: documentId,
      status: "failed",
      error: message,
    };
    await deps.sendWebhook(payload, deps.webhookUrl, deps.webhookSecret);
    return;
  }

  // Deliberately outside the try/catch above: a valid extraction already
  // exists at this point, so a transient failure persisting/announcing it
  // (e.g. a Supabase or webhook hiccup) must not be reported as "failed" —
  // that would overwrite a real result with a misleading status.
  await deps.supabase.insertExtraction(extraction);
  await deps.supabase.updateDocumentStatus("done");

  const payload: WebhookPayload = {
    document_id: documentId,
    status: "done",
    confidence: extraction.confidence,
  };
  await deps.sendWebhook(payload, deps.webhookUrl, deps.webhookSecret);
}
