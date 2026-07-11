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
    await markFailed(documentId, error, deps);
    return;
  }

  // A valid extraction exists at this point, but it isn't a real, visible
  // result until it's actually persisted. A failure here - e.g. a DB
  // constraint violation, or a transient connectivity blip - must still
  // resolve the document to a terminal state: leaving it "processing"
  // forever with no error surfaced (the previous behavior) is worse than
  // a possibly-imprecise "failed" label, since at least it's visible and
  // actionable rather than silently stuck.
  try {
    await deps.supabase.insertExtraction(extraction);
    await deps.supabase.updateDocumentStatus("done");
  } catch (error) {
    await markFailed(documentId, error, deps);
    return;
  }

  const payload: WebhookPayload = {
    document_id: documentId,
    status: "done",
    confidence: extraction.confidence,
  };
  // Deliberately unguarded: the document is already durably persisted and
  // marked "done" by this point, so a webhook hiccup must not retroactively
  // change its status.
  await deps.sendWebhook(payload, deps.webhookUrl, deps.webhookSecret);
}

async function markFailed(documentId: string, error: unknown, deps: ProcessDocumentDeps): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  await deps.supabase.updateDocumentStatus("failed", message);

  const payload: WebhookPayload = {
    document_id: documentId,
    status: "failed",
    error: message,
  };
  await deps.sendWebhook(payload, deps.webhookUrl, deps.webhookSecret);
}
