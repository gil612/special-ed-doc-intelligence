import { getRequestContext } from "@cloudflare/next-on-pages";
import { createGeminiClient } from "@/lib/gemini";
import { extractPdfText } from "@/lib/pdf";
import { processDocument } from "@/lib/process-document";
import {
  createSupabaseClient,
  insertDocument,
  insertExtraction,
  updateDocumentStatus,
} from "@/lib/supabase";
import { sendWebhook } from "@/lib/webhook";

export const runtime = "edge";

interface Env {
  DOCS_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  DOCUMENTS_API_KEY: string;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
}

// `getRequestContext`'s `env` is typed via the ambient `CloudflareEnv`
// interface (declared by @cloudflare/next-on-pages), not via a generic type
// argument to `getRequestContext` itself — see
// node_modules/@cloudflare/next-on-pages/dist/api/getRequestContext.d.ts and
// its README ("the `env` object ... implements the `CloudflareEnv`
// interface, add your binding types to such interface"). Augment it here so
// `env` is correctly typed as `Env` at the call site below.
declare global {
  interface CloudflareEnv extends Env {}
}

export async function POST(request: Request): Promise<Response> {
  const { env, ctx } = getRequestContext();

  // SPEC.md/CLAUDE.md: "REST API requires an X-API-Key header" is a stated
  // hard requirement covering every endpoint, not just the read endpoints —
  // upload triggers billable Gemini calls and storage writes, so it must
  // not be left open on a public deployment. The `!env.DOCUMENTS_API_KEY`
  // check matters on its own: without it, a misconfigured empty-string env
  // var would make an equally-empty `X-API-Key` header pass the `!==` check,
  // bypassing auth entirely rather than failing closed.
  if (!env.DOCUMENTS_API_KEY || request.headers.get("X-API-Key") !== env.DOCUMENTS_API_KEY) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "multipart field 'file' (application/pdf) is required" }, { status: 400 });
  }

  const fileBuffer = await file.arrayBuffer();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let storagePath: string;
  let documentId: string;
  try {
    storagePath = `documents/${crypto.randomUUID()}.pdf`;
    await env.DOCS_BUCKET.put(storagePath, fileBuffer);
    documentId = await insertDocument(supabase, storagePath, file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `failed to store document: ${message}` }, { status: 503 });
  }

  ctx.waitUntil(
    processDocument(documentId, {
      fetchDocumentText: () => extractPdfText(fileBuffer),
      geminiClient: createGeminiClient(env.GEMINI_API_KEY),
      supabase: {
        insertExtraction: (extraction) => insertExtraction(supabase, documentId, extraction),
        updateDocumentStatus: (status, errorMessage) =>
          updateDocumentStatus(supabase, documentId, status, errorMessage ?? null),
      },
      sendWebhook,
      webhookUrl: env.WEBHOOK_URL,
      webhookSecret: env.WEBHOOK_SECRET,
    })
  );

  return Response.json({ document_id: documentId, status: "processing" }, { status: 202 });
}
