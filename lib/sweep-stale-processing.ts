// Cloudflare's waitUntil() only extends a request's background execution by
// ~30s of wall-clock time before the platform kills the isolate outright -
// not a JS exception, an external termination no try/catch in
// process-document.ts can observe. If the pipeline (PDF parse + Gemini call
// + Supabase writes) runs longer than that, a document can be left stuck at
// "processing" forever with no error anywhere. This sweep, run on a
// schedule (see worker-entry.ts), is the safety net: anything still
// "processing" past a generous threshold almost certainly hit that ceiling
// (or some other silent failure) and gets marked "failed" instead of
// staying invisible.
export const STALE_PROCESSING_THRESHOLD_MINUTES = 2;

export const STALE_PROCESSING_MESSAGE =
  "עיבוד המסמך נמשך זמן רב מדי ולא הושלם — ככל הנראה חריגה ממגבלת זמן הריצה של הפלטפורמה";

export interface SweepDeps {
  findStaleProcessingDocumentIds: () => Promise<string[]>;
  updateDocumentStatus: (documentId: string, status: "failed", errorMessage: string) => Promise<void>;
}

export async function sweepStaleProcessingDocuments(deps: SweepDeps): Promise<{ sweptCount: number }> {
  const staleIds = await deps.findStaleProcessingDocumentIds();

  for (const documentId of staleIds) {
    await deps.updateDocumentStatus(documentId, "failed", STALE_PROCESSING_MESSAGE);
  }

  return { sweptCount: staleIds.length };
}
