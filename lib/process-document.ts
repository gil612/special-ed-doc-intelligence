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
  try {
    const rawText = await deps.fetchDocumentText();
    const { redactedText } = redactText(rawText);
    const extraction = await extractIEP(redactedText, deps.geminiClient);

    await deps.supabase.insertExtraction(extraction);
    await deps.supabase.updateDocumentStatus("done");

    const payload: WebhookPayload = {
      document_id: documentId,
      status: "done",
      confidence: extraction.confidence,
    };
    await deps.sendWebhook(payload, deps.webhookUrl, deps.webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await deps.supabase.updateDocumentStatus("failed", message);

    const payload: WebhookPayload = {
      document_id: documentId,
      status: "failed",
      error: message,
    };
    await deps.sendWebhook(payload, deps.webhookUrl, deps.webhookSecret);
  }
}
